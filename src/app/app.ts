import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebSqlite } from 'sqlite-assembly';
import { mockData } from './utils/util';

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
  imports: [RouterOutlet],
  providers: [WebSqlite],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('wasm-sqllite');
  _mockData = mockData;
  constructor(
    private webSqlite: WebSqlite
  ) {  
    setTimeout(() => {
      this.webSqlite.init('test')
      // this.batchSqlOperations()
      this.executeQuery(`INSERT INTO your_table (a, b) VALUES (1, 'value 1')`)
            this.executeQuery('SELECT * FROM your_table')
            // this.insertTenRecords()
            this.executeFromJSON()

    }, 600);
  }

  async executeFromJSON() {
    const logs = [
    { timestamp: 12345, message: 'Error A' },
    { timestamp: 12346, message: 'Error B' }
];
// This single line does everything
   let result = await this.webSqlite.importComplexData('products', mockData2);
   console.log('result complex', result)
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
    console.log('result batch sql', result)
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
