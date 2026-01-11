import { Component, inject, signal, WritableSignal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebSqlite } from 'sqlite-assembly';
import { mockData } from './utils/util';
import { FormsModule } from '@angular/forms';
export const mockData2 = {
  // Factory 1: Electronics
  "c9110d3e-56e2-4115-b209-668582121599": [
    {
      "guid": "a24a6ea4-ce75-4665-87cd-36e985007b56",
      "id": "prod_88349102",
      "sku": "AUDIO-WH-NC-BLK",
      "title": "SonicStream Pro Noise-Cancelling Headphones",
      "price": {
        "currency": "USD",
        "regular_price": 299.99,
        "sale_price": 249.99
      },
      "stock": {
        "in_stock": true,
        "quantity": 45
      },
      "images": [
        {
          "url": "https://cdn.example.com/products/sonicstream-black-front.jpg",
          "alt_text": "SonicStream Pro Front View",
          "is_primary": true
        },
        {
          "url": "https://cdn.example.com/products/sonicstream-black-side.jpg",
          "alt_text": "SonicStream Pro Side View",
          "is_primary": false
        }
      ]
    },
    {
      "guid": "b7392c4f-22f3-4417-a068-120793740921",
      "id": "prod_99210044",
      "sku": "WEAR-WATCH-S6-GLD",
      "title": "Chronos Smartwatch Series 6",
      "price": {
        "currency": "USD",
        "regular_price": 399.00,
        "sale_price": 399.00
      },
      "stock": {
        "in_stock": true,
        "quantity": 12
      },
      "images": [
        {
          "url": "https://cdn.example.com/products/chronos-s6-gold.jpg",
          "alt_text": "Chronos Series 6 Gold Aluminum Case",
          "is_primary": true
        }
      ]
    },
    {
      "guid": "c9110d3e-56e2-4115-b209-668582121544",
      "id": "prod_11029384",
      "sku": "CAM-DSLR-X200-KIT",
      "title": "Lumina X200 Mirrorless Camera Kit",
      "price": {
        "currency": "USD",
        "regular_price": 1200.00,
        "sale_price": 1050.00
      },
      "stock": {
        "in_stock": false,
        "quantity": 0
      },
      "images": [
        {
          "url": "https://cdn.example.com/products/lumina-x200-body.jpg",
          "alt_text": "Lumina X200 Body Only",
          "is_primary": true
        },
        {
          "url": "https://cdn.example.com/products/lumina-x200-lens.jpg",
          "alt_text": "Lumina X200 with 18-55mm Lens",
          "is_primary": false
        }
      ]
    }
  ],
  // Factory 2: Accessories (Example of a second group)
  "d8220e4f-67f3-5226-c301-779693232600": [
    {
      "guid": "e5510f5e-77a3-5337-d402-880704343711",
      "id": "prod_22030495",
      "sku": "ACC-CASE-IPH-12",
      "title": "Clear Shield Case for iPhone 12",
      "price": {
        "currency": "USD",
        "regular_price": 19.99,
        "sale_price": 19.99
      },
      "stock": {
        "in_stock": true,
        "quantity": 150
      },
      "images": []
    }
  ]
};

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
}
