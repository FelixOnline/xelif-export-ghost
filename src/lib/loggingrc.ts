let logOpts: {
  name: string;
  mode?: string;
  level?: string;
  transports: string[];
  path?: string;
};

logOpts = {
  name: "migrateTools",
  mode: "long",
  level: "debug",
  transports: ["stdout"],
};

export default logOpts;
