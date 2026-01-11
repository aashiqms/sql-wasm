import { Component, inject, signal, WritableSignal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebSqlite } from 'sqlite-assembly';
import { mockData } from './utils/db-util';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FormsModule],
  providers: [WebSqlite],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('wasm-sqllite');
  _mockData = mockData;
  // UI Signals
  // Note: Angular 17+ [(ngModel)] supports signals directly
  sqlQuery: WritableSignal<string> = signal('SELECT * FROM sqlite_master');
  targetTable: WritableSignal<string> = signal('');
  
  // Output Signals
  consoleOutput: WritableSignal<string> = signal('');
  isError: WritableSignal<boolean> = signal(false);
  webSqlite = inject(WebSqlite)

  async ngOnInit() {
    try {
      await this.webSqlite.init('my-store-db');
      this.log('Database initialized successfully.');
    } catch (err) {
      this.logError(err);
    }
  }

  /**
   * 1. Run Raw SQL from Textarea
   */
  async runQuery() {
    const query = this.sqlQuery(); // Read signal
    if (!query.trim()) return;
    
    this.log(`Executing: ${query}...`);
    
    try {
      const result = await this.webSqlite.executeSql(query, []);
      
      const output = {
        rowsReturned: result.rows ? result.rows.length : 0,
        data: result.rows || result
      };
      
      this.log(JSON.stringify(output, null, 2));
    } catch (err) {
      this.logError(err);
    }
  }

  /**
   * 2. Clear a specific table
   */
  async clearTable() {
    const table = this.targetTable(); // Read signal
    if (!table.trim()) return;

    if (!confirm(`Are you sure you want to delete all data from "${table}"?`)) return;

    try {
      await this.webSqlite.clearTable(table);
      this.log(`Table "${table}" cleared successfully.`);
    } catch (err) {
      this.logError(err);
    }
  }

  /**
   * 3. Clear the entire database
   */
  async clearDatabase() {
    if (!confirm('WARNING: This will drop ALL tables and data. Continue?')) return;

    try {
      const result = await this.webSqlite.clearDatabase();
      this.log(`Database reset complete. Dropped ${result.tablesDropped} tables.`);
    } catch (err) {
      this.logError(err);
    }
  }

  /**
   * Helper: Import Mock Data
   */
  async loadMockData() {
    this.log('Importing complex mock data...');
    try {
      const result = await this.webSqlite.importComplexData('products', mockData);
      this.log('Import Success: \n' + JSON.stringify(result, null, 2));
    } catch (err) {
      this.logError(err);
    }
  }

  // --- Logging Helpers ---
  private log(message: string) {
    // Update signals
    this.isError.set(false);
    this.consoleOutput.set(message);
  }

  private logError(err: any) {
    // Update signals
    this.isError.set(true);
    this.consoleOutput.set(`ERROR: ${err.message || JSON.stringify(err)}`);
    console.error(err);
  }

  exportDatabase() {
  this.webSqlite.exportDb().then(() => {
    console.log('Download started');
  });
}
}
