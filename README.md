# xelif-export-ghost

Create a file called `mysql-config.json` in the same directory as this `README` file. The content should look something like this, amended with credentials as appropriate.

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
npm install
```

Run the automatic compiler using the _run_ button in IntelliJ or with the following command from the terminal
```shell
npm run build:watch
```

Run the program by calling the compiled executable JavaScript like so
```shell
node .\build\index.js
```

Use `prettier` to format TypeScript files
```shell
npx prettier --write .\src\lib\*.ts .\src\*.ts
```
