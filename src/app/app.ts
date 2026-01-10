import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebSqlite } from 'angular-web-sqlite';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  providers: [WebSqlite],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('wasm-sqllite');
  constructor(
    private webSqlite: WebSqlite
  ) {  
    setTimeout(() => {
      this.webSqlite.init('test')
      this.batchSqlOperations()
      this.executeQuery(`INSERT INTO your_table (a, b) VALUES (1, 'value 1')`)
            this.executeQuery('SELECT * FROM your_table')

    }, 600);
  }

  async initializeDatabase(dbName: string) {
    await this.webSqlite.init(dbName);
  }

  async executeQuery(sqlQuery: string) {
    const sql = sqlQuery;
    const params: any = [];
    const result = await this.webSqlite.executeSql(sql, params);
    console.log('result', result)
    // Process the result as needed
  }

  async batchSqlOperations() {
    const sqls = [
        ["CREATE TABLE IF NOT EXISTS your_table (a TEXT, b TEXT)", []],
        ["CREATE TABLE IF NOT EXISTS your_table2 (c TEXT, d TEXT)", []],
        ];
    const result = await this.webSqlite.batchSql(sqls);
    console.log('result', result)
    // Process the result as needed
  }
}
