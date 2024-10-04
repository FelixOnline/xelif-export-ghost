import mysql, { Connection } from "mysql2/promise";
import sanitizeHtml from "sanitize-html";
import * as cheerio from "cheerio";
import { MigrateContext } from "@tryghost/mg-context";
import { AuthorObject } from "@tryghost/mg-context/build/lib/AuthorContext.js";
import {
  Block,
  BlockType,
  BookReviewBlock,
  FilmReviewBlock,
  Image,
  ImageBlock,
  QuotationBlock,
  ReviewBlock,
  SidebarBlock,
  TextBlock,
} from "./blocks.js";
import { readFileSync } from "fs";

const context = new MigrateContext();

export const ghostSupportedHtml = {
  allowedTags: [
    "b",
    "i",
    "em",
    "strong",
    "a",
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "blockquote",
    "figure",
    "figcaption",
    "img",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "div",
    "hr",
    "iframe",
    "span",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel", "target", "class"],
    img: ["src", "alt", "title", "class"],
    iframe: [
      "width",
      "height",
      "src",
      "title",
      "frameborder",
      "allow",
      "allowfullscreen",
    ],
    figure: ["class"],
    div: ["class"],
  },
  allowedClasses: {
    "*": ["kg-*"],
  },
};

class XelifExporter {
  private readonly connectionPromise: Promise<Connection>;

  constructor() {
    const config = JSON.parse(readFileSync("mysql-config.json", "utf-8"));
    this.connectionPromise = mysql.createConnection(config);
  }

  async processAll(): Promise<string> {
    let dbConnection = await this.connectionPromise;
    const [rows] = await dbConnection.execute(`
        SELECT articles.id,
               sections.title              AS section_name,
               sections.description        AS section_description,
               section_slugs.slug          AS section_slug,
               issues.issue,
               articles.updated_at,
               articles.created_at,
               articles.publish_start_date AS published_at,
               headline                    AS title,
               lede                        AS custom_excerpt,
               article_slugs.slug          AS slug
        FROM articles
                 LEFT JOIN article_slugs ON articles.id = article_slugs.article_id
                 LEFT JOIN issues ON articles.issue_id = issues.id
                 LEFT JOIN sections ON articles.section_id = sections.id
                 LEFT JOIN section_slugs ON sections.id = section_slugs.section_id
        WHERE articles.deleted_at IS NULL
          AND articles.published = 1
          AND article_slugs.deleted_at IS NULL
          AND article_slugs.active = 1
          AND sections.deleted_at IS NULL
          AND sections.published = 1
          AND section_slugs.deleted_at IS NULL
          AND section_slugs.active = 1
    `);

    await Promise.all((rows as any[]).map((data) => this.processArticle(data)));

    return context.ghostJson;
  }

  private async getArticleAuthors(articleId: number): Promise<AuthorObject[]> {
    let dbConnection = await this.connectionPromise;
    const [rows] = (await dbConnection.execute(
      `
          SELECT name,
                 CONCAT_WS(' - ', role, bio) AS bio,
                 slug
          FROM articles
                   LEFT JOIN article_writer ON articles.id = article_writer.article_id
                   LEFT JOIN writers ON article_writer.writer_id = writers.id
                   LEFT JOIN writer_slugs ON writers.id = writer_slugs.writer_id
          WHERE articles.id = ?
            AND writers.deleted_at IS NULL
            AND writers.current = 1
            AND writer_slugs.deleted_at IS NULL
            AND writer_slugs.active = 1
          ORDER BY article_writer.position
      `,
      [articleId],
    )) as any[][];

    if (rows.length == 0) {
      return [
        {
          name: "Felix",
          slug: "felix",
          bio: "Student Newspaper of Imperial College London",
        },
      ];
    }

    return rows.map((data) => ({
      name: data["name"],
      slug: data["slug"],
      bio: data["bio"],
    }));
  }

  private async processArticle(data: any) {
    const post = context.addPost();

    post.set("title", data["title"]);
    post.set("slug", data["slug"]);

    post.set("visibility", "public");
    post.set("status", "published"); // Only published posts are selected in the query
    post.set("type", data["section_slug"] == "about" ? "page" : "post");

    post.set("created_at", data["created_at"]);
    post.set("updated_at", data["updated_at"]);
    post.set("published_at", data["published_at"]);

    const lede = data["custom_excerpt"];
    if (lede != null) {
      post.set(
        "custom_excerpt",
        lede.length > 300 ? lede.substring(0, 299) + "…" : lede,
      );
    }

    post.addTag({
      name: data["section_name"],
      slug: data["section_slug"],
      description: data["section_description"],
    });

    let issue_number: number = data["issue"];
    if (issue_number != null) {
      post.addTag({
        name: "Issue " + issue_number,
        slug: `issue-${issue_number}`,
      });
    }

    let articleId: number = data["id"];
    let authors: AuthorObject[] = await this.getArticleAuthors(articleId);
    await Promise.all(authors.map((author) => post.addAuthor(author)));

    let image = await this.getFeatureImage(articleId);
    if (image != null) {
      post.set(
        "feature_image",
        `https://felixonline.co.uk/img/${image["uuid"]}`,
      );
      post.set("feature_image_alt", image["alt_text"]);
      post.set("feature_image_caption", image["caption"]);
    }

    const blocks: Block[] = await this.getArticleBlocks(articleId);
    const rawHtml = blocks.map((block) => block.formatHtml()).join("\n");

    const $html: any = cheerio.load(rawHtml);

    // Remove hidden elements
    $html('[style*="display:none"]').remove();
    $html('[style*="display: none"]').remove();

    // Remove cells that only contain a non-breaking space
    $html("p").each((_i: any, el: any) => {
      const text = $html(el).html().trim();

      if (text === "&nbsp;") {
        $html(el).remove();
      }
    });

    // Remove empty tags
    $html("p, figure").each((_i: any, el: any) => {
      const elementHtml = $html(el).html().trim();

      if (elementHtml === "") {
        $html(el).remove();
      }
    });

    // Convert '...' to <hr />
    $html("p").each((_i: any, el: any) => {
      const text = $html(el).text().trim();

      if (text === "..." || text === "…" || text === "&hellip;") {
        $html(el).replaceWith("<hr />");
      }
    });

    // Remove https://felixonline.co.uk from links to make them relative
    $html("a[href^='https://felixonline.co.uk']").each((_i: any, el: any) => {
      const href = $html(el).attr("href");
      const relativeHref = href.replace("https://felixonline.co.uk", "");
      $html(el).attr("href", relativeHref);
    });

    let bodyHtml = $html.html();

    // Remove random non-printable characters like 
    bodyHtml = bodyHtml.replace(/[\x00-\x1F\x7F-\x9F]/g, "");

    const sanitizedHtml = sanitizeHtml(bodyHtml, ghostSupportedHtml);

    post.set("html", sanitizedHtml.trim());
  }

  private async getImage(mediaId: number): Promise<Image> {
    let dbConnection = await this.connectionPromise;
    const [rows] = (await dbConnection.execute(
      `
          SELECT uuid, width, height, filename, alt_text, credit, caption
          FROM medias
          WHERE id = ?
            AND deleted_at IS NULL
      `,
      [mediaId],
    )) as any[][];

    if (rows.length === 0) {
      throw new Error(`Image with ID ${mediaId} not found.`);
    }

    const row = rows[0];
    return {
      uuid: row["uuid"],
      width: row["width"],
      height: row["height"],
      filename: row["filename"],
      alt_text: row["alt_text"],
      credit: row["credit"],
      caption: row["caption"],
    };
  }

  private async getFeatureImage(articleId: number): Promise<Image | null> {
    let dbConnection = await this.connectionPromise;
    const [rows] = (await dbConnection.execute(
      `
          SELECT media_id
          FROM mediables
          WHERE deleted_at IS NULL
            AND mediable_id = ?
            AND mediable_type = 'articles'
      `,
      [articleId],
    )) as any[][];

    if (rows.length === 0) {
      return null;
    }

    return this.getImage(rows[0]["media_id"]);
  }

  private async getArticleBlocks(articleId: number): Promise<Block[]> {
    let dbConnection = await this.connectionPromise;
    const [rows] = (await dbConnection.execute(
      `
          SELECT position,
                 type,
                 content,
                 media_id
          FROM blocks
                   LEFT JOIN mediables ON blocks.type = 'image' AND blocks.id = mediables.mediable_id
          WHERE blockable_id = ?
            AND blockable_type = 'articles'
          ORDER BY position;
      `,
      [articleId],
    )) as any[][];

    const blocks: Block[] = [];
    for (const row of rows) {
      const blockType = row["type"];
      const content = JSON.parse(row["content"]);
      switch (blockType) {
        case BlockType.TEXT:
          if (!content) continue;
          blocks.push(new TextBlock(content["html"]));
          break;
        case BlockType.REVIEW:
          blocks.push(
            new ReviewBlock(
              content["title"],
              content["what"],
              content["when"],
              content["where"],
              content["cost"],
              content["stars"],
            ),
          );
          break;
        case BlockType.SIDEBAR:
          blocks.push(new SidebarBlock(content["html"], content["title"]));
          break;
        case BlockType.QUOTATION:
          blocks.push(new QuotationBlock(content["html"]));
          break;
        case BlockType.IMAGE:
          const mediaId: number | null = row["media_id"];
          blocks.push(
            new ImageBlock(
              mediaId ? await this.getImage(mediaId) : null,
              content["float"],
              content["width"],
            ),
          );
          break;
        case BlockType.BOOK_REVIEW:
          blocks.push(
            new BookReviewBlock(
              content["stars"],
              content["title"],
              content["author"],
            ),
          );
          break;
        case BlockType.FILM_REVIEW:
          blocks.push(
            new FilmReviewBlock(
              content["stars"],
              content["year"],
              content["title"],
              content["director"],
              content["starring"],
            ),
          );
          break;
        default:
          throw new Error(`Block type ${blockType} not supported.`);
      }
    }

    return blocks;
  }
}

export { XelifExporter };
