# Xelif to Ghost exporter

> Exports articles, pages and images from [Xelif](https://github.com/FelixOnline/xelif), our custom-built Twill-based
> CMS for importing into [Ghost](https://ghost.org).

# Setup

Create a file called `mysql-config.json` in the same directory as this `README` file. The content should look something
like this, amended with credentials as appropriate.

```json
{
  "host": "127.0.0.1",
  "port": 3306,
  "user": "username",
  "password": "password",
  "database": "laravel"
}
```

Install the required dependencies with

```shell
yarn
```

Run the program with

```shell
yarn build && node build/index.js
```

Use `prettier` to format TypeScript files

```shell
npx prettier --write src/lib/*.ts src/*.ts
```
