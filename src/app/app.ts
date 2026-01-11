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
      // this.executeQuery(`INSERT INTO your_table (a, b) VALUES (1, 'value 1')`)
            this.executeQuery('SELECT * FROM your_table')
            // this.insertTenRecords()

    }, 600);
  }

  async initializeDatabase(dbName: string) {
    await this.webSqlite.init(dbName);
  }

  async executeQuery(sqlQuery: string) {
    const sql = sqlQuery;
    const params: any = [];
    const result = await this.webSqlite.executeSql(sql, params);
    console.log('result' + 'sqlQuery: ' + sqlQuery, result)
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

  async insertTenRecords() {
  const batchRequests = [];

  // 1. Generate the INSERT statements
  for (let i = 1; i <= 10; i++) {
    batchRequests.push([
      'INSERT INTO your_table (a, b) VALUES (?, ?)', 
      [`value_a_${i}`, i] // Params: a (string), b (number)
    ]);
  }

  // 2. (Optional) Add a SELECT to return the data you just inserted
  // Without this, the 'rows' for the INSERT commands will be empty arrays.
  batchRequests.push([
    'SELECT * FROM your_table DESC LIMIT 10', 
    []
  ]);

  try {
    // 3. Execute the batch
    const response = await this.webSqlite.batchReturnSql(batchRequests);

    // response.rows is an array of arrays.
    // Indices 0-9 are the INSERT results (empty arrays).
    // Index 10 is the SELECT result.
    const insertedData = response; 
    
    console.log('Successfully inserted and retrieved:', insertedData);

  } catch (error) {
    console.error('Transaction failed, no records were inserted:', error);
  }
}
exportDatabase() {
  this.webSqlite.exportDb().then(() => {
    console.log('Download started');
  });
}
}
