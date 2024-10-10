import { XelifExporter } from "./lib/process.js";
import { readFileSync } from "node:fs";
import MgAssetScraper from "@tryghost/mg-assetscraper";
import { GhostLogger } from "@tryghost/logging";
import MgLinkFixer from "@tryghost/mg-linkfixer";
import fsUtils from "@tryghost/mg-fs-utils";
import { makeTaskRunner } from "@tryghost/listr-smart-renderer";
import mgHtmlLexical from "@tryghost/mg-html-lexical";
import prettyMilliseconds from "pretty-ms";
import logConfig from "./lib/loggingrc.js";

const initialize = (options: any, logger: any) => {
  logger.info({ message: "Initialize migration" });
  return {
    title: "Initializing Workspace",
    task: (ctx: any, task: any) => {
      ctx.options = options;
      ctx.logger = logger;
      ctx.allowScrape = {
        all: false,
        images: true,
        media: true,
        files: false,
        web: false,
      };

      // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
      ctx.options.cacheName =
        options.cacheName || fsUtils.utils.cacheNameFromPath(ctx.options.url);
      ctx.fileCache = new fsUtils.FileCache(`xelif-${ctx.options.cacheName}`, {
        tmpPath: ctx.options.tmpPath,
      });
      ctx.assetScraper = new MgAssetScraper(
        ctx.fileCache,
        {
          sizeLimit: ctx.options.sizeLimit,
          allowImages: ctx.allowScrape.images,
          allowMedia: ctx.allowScrape.media,
          allowFiles: ctx.allowScrape.files,
          baseDomain: "https://img.felixonline.co.uk",
        },
        ctx,
      );
      ctx.linkFixer = new MgLinkFixer();

      task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
    },
  };
};

const getFullTaskList = (options: any, logger: any) => {
  return [
    initialize(options, logger),
    {
      title: "Read xelif content",
      task: async (ctx: any) => {
        let exporter = new XelifExporter();
        try {
          ctx.result = await exporter.processAll();
          await ctx.fileCache.writeTmpFile(
            ctx.result,
            "xelif-export-data.json",
          );
        } catch (error) {
          ctx.logger.error({ message: "Failed to read xelif content", error });
          throw error;
        }
      },
    },
    {
      title: "Fetch images via AssetScraper",
      skip: (ctx: any) => {
        return [
          ctx.allowScrape.images,
          ctx.allowScrape.media,
          ctx.allowScrape.files,
        ].every((element) => !element);
      },
      task: async (ctx: any) => {
        let tasks = ctx.assetScraper.fetch(ctx);
        return makeTaskRunner(tasks, {
          verbose: options.verbose,
          exitOnError: true,
          concurrent: false,
        });
      },
    },
    {
      title: "Convert HTML -> Lexical",
      skip: (ctx: any) => !(ctx.options.convertHtmlToLexical ?? false),
      task: (ctx: any) => {
        try {
          let tasks = mgHtmlLexical.convert(ctx);
          return makeTaskRunner(tasks, options);
        } catch (error) {
          ctx.logger.error({
            message: "Failed to convert HTML -> Lexical",
            error,
          });
          throw error;
        }
      },
    },
    {
      title: "Write Ghost import JSON File",
      task: async (ctx: any) => {
        try {
          await ctx.fileCache.writeGhostImportFile(ctx.result);
        } catch (error) {
          ctx.logger.error({
            message: "Failed to write Ghost import JSON File",
            error,
          });
          throw error;
        }
      },
    },
    {
      title: "Write Ghost import zip",
      skip: () => !options.zip,
      task: async (ctx: any, task: any) => {
        const isStorage =
          (options?.outputStorage &&
            typeof options.outputStorage === "object") ??
          false;

        try {
          let timer = Date.now();
          const zipFinalPath = options.outputPath || process.cwd();
          // zip the file and save it temporarily
          ctx.outputFile = await fsUtils.zip.write(
            zipFinalPath,
            ctx.fileCache.zipDir,
            ctx.fileCache.defaultZipFileName,
          );

          if (isStorage) {
            const storage = options.outputStorage;
            const localFilePath = ctx.outputFile.path;

            // read the file buffer
            const fileBuffer = await readFileSync(ctx.outputFile.path);
            // Upload the file to the storage
            ctx.outputFile.path = await storage.upload({
              body: fileBuffer,
              fileName: `gh-xelif-${ctx.options.cacheName}.zip`,
            });
            // now that the file is uploaded to the storage, delete the local zip file
            await fsUtils.zip.deleteFile(localFilePath);
          }

          task.output = `Successfully written zip to ${ctx.outputFile.path} in ${prettyMilliseconds(Date.now() - timer)}`;
        } catch (error) {
          ctx.logger.error({
            message: "Failed to write and upload ZIP file",
            error,
          });
          throw error;
        }
      },
    },
    {
      title: "Clearing cached files",
      skip: () => !options.zip || (options.zip && !options.cache),
      task: async (ctx: any) => {
        try {
          await ctx.fileCache.emptyCurrentCacheDir();
        } catch (error) {
          ctx.logger.error({
            message: "Failed to clear temporary cached files",
            error,
          });
          throw error;
        }
      },
    },
  ];
};

const getTaskRunner = (options: any, logger: any) => {
  let tasks = [];

  tasks = getFullTaskList(options, logger);

  // Configure a new Listr task manager, we can use different renderers for different configs
  return makeTaskRunner(tasks, Object.assign({ topLevel: true }, options));
};

export default {
  initialize,
  getFullTaskList,
  getTaskRunner,
};

let logger = new GhostLogger(logConfig);
const startMigrationTime = Date.now();

let argv: any = {
  url: "https://felixonline.co.uk",
  zip: true,
  verbose: false,
  convertHtmlToLexical: true,
};

let context = {
  errors: [],
  warnings: [],
};

try {
  // Fetch the tasks, configured correctly according to the options passed in
  let migrate = getTaskRunner(argv, logger);

  // Run the migration
  await migrate.run(context);
} catch (error) {
  logger.error({
    message: "Migration finished but with errors",
    error,
  });

  context.errors.forEach((error) => logger.error(error));
}
