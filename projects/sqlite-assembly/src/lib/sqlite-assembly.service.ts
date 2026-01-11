/* eslint-disable one-var */
/* eslint-disable no-bitwise */
/* eslint-disable object-shorthand */
import '@angular/compiler';
import { Injectable } from '@angular/core';

export interface Message {
  type: 'init' | 'executeSql' | 'batchSql' | 'batchReturnSql' | 'export'| 'reset'; // Added 'reset'
  id: string;
  flags?: string;
  filename?: string;
  password?: string;
  error?: any;
  sql?: string;
  param?: any;
  sqls?: any;
  rows?: any;
  rowsAffected?: number;
}
// Interface for the return value
  interface ImportResult {
    table: string;
    inserted: number;
    children?: ImportResult[];
  }

@Injectable()
export class WebSqlite {

  private sqliteClientWorkerPath = 'sqlite-client/sqlite-worker.js';
  private worker!: Worker;
  private queuedPromises: any = {};
  private isInitialized!: boolean;
  private filename!: string;

  constructor(
  ) { }

 init(dbName: string, flags?: string, password?: string) {
    this.worker = new Worker(this.sqliteClientWorkerPath, { type: 'module' });
    this.worker.onmessage = this.messageReceived.bind(this);
    this.filename = `/${dbName}.sqlite3`;
    
    // Pass the password in the init message
    const initDb: Message = { 
        type: 'init', 
        filename: this.filename, 
        flags: flags || 'ct', 
        password: password, 
        id: this.generateGuid() 
    };

    this.worker.postMessage(initDb);
    return new Promise<any>((resolve, reject) => {
      this.queuedPromises[initDb.id] = {
        resolve,
        reject,
      };
    });
  }

  public async executeSql(sql: string, params: any) {
    await this.waitForInitialization();
    const executeSql: Message =
      { type: 'executeSql', sql: sql, filename: this.filename, param: params, id: this.generateGuid() };
    this.worker.postMessage(executeSql);
    return new Promise<any>((resolve, reject) => {
      this.queuedPromises[executeSql.id] = {
        resolve,
        reject
      };
    });
  }

  /**
   * Function for transactions without return value
   */
  public async batchSql(sqls: any) {
    await this.waitForInitialization();
    const batchSql: Message =
      { type: 'batchSql', sqls: sqls, filename: this.filename, id: this.generateGuid() };
    this.worker.postMessage(batchSql);
    return new Promise<any>((resolve, reject) => {
      this.queuedPromises[batchSql.id] = {
        resolve,
        reject
      };
    });
  }

    /**
   * Function that downloads sqlite file
   */
  public async exportDb(password?: string) {
    await this.waitForInitialization();
    
    const exportMsg: Message = { 
        type: 'export', 
        filename: this.filename, 
        password: password,
        id: this.generateGuid() 
    };
    
    this.worker.postMessage(exportMsg);

    return new Promise<void>((resolve, reject) => {
      this.queuedPromises[exportMsg.id] = {
        // Change: The generic 'any' here receives the object returned by messageReceived
        resolve: (response: any) => {
           // FIX: Extract .rows (which contains the ArrayBuffer) from the response object
           if (response && response.rows) {
               this.downloadFile(response.rows, this.filename.replace('/', ''));
           } else {
               console.error('Export failed: No data received');
           }
           resolve();
        },
        reject
      };
    });
  }

  // Helper to trigger the download in the browser
  private downloadFile(buffer: ArrayBuffer, fileName: string) {
    debugger
    const blob = new Blob([buffer], { type: 'application/x-sqlite3' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }


  /**
   * Function that returns the result of multiple transactions
   */
  public async batchReturnSql(sqls: any[]) {
    await this.waitForInitialization();
    
    const batchReturnSql: Message = { 
        type: 'batchReturnSql', 
        sqls: sqls, 
        filename: this.filename, 
        id: this.generateGuid() 
    };

    this.worker.postMessage(batchReturnSql);
    
    return new Promise<any>((resolve, reject) => {
      this.queuedPromises[batchReturnSql.id] = {
        resolve,
        reject
      };
    });
  }

  // ---------------------------------------------------------
  //  NEW: JSON HELPER METHODS
  // ---------------------------------------------------------

  /**
   * Inserts JSON data. Automatically creates the table if it doesn't exist.
   * @param tableName Name of the table
   * @param data Single Object or Array of Objects
   */
  public async insertFromJson(tableName: string, data: Record<string, any> | Record<string, any>[]) {
    await this.waitForInitialization();

    // 1. Validate data
    const isArray = Array.isArray(data);
    if (isArray && (data as any[]).length === 0) return Promise.resolve();
    if (!data) return Promise.resolve();

    // 2. Extract schema from the first item and ensure table exists
    const schemaSource = isArray ? (data as any[])[0] : data;
    await this.ensureTableExists(tableName, schemaSource);

    // 3. Process Insert
    if (isArray) {
      const batchData = (data as any[]).map(row => {
        const { sql, values } = this.generateInsertStatement(tableName, row);
        return [sql, values];
      });
      return this.batchSql(batchData);
    } else {
      const { sql, values } = this.generateInsertStatement(tableName, data as any);
      return this.executeSql(sql, values);
    }
  }

  /**
   * Updates a row based on a unique identifier column.
   * @param tableName Name of the table
   * @param data The data object containing changes AND the identifier
   * @param idColumn The name of the column to use as the WHERE clause (default: 'id')
   */
  public async updateFromJson(tableName: string, data: Record<string, any>, idColumn: string = 'id') {
    await this.waitForInitialization();

    if (!data.hasOwnProperty(idColumn)) {
      throw new Error(`Data is missing the identifier column: ${idColumn}`);
    }

    const idValue = data[idColumn];
    const updateKeys = Object.keys(data).filter(k => k !== idColumn);

    if (updateKeys.length === 0) return Promise.resolve();

    // Generate: UPDATE "table" SET "col1" = ?, "col2" = ? WHERE "id" = ?
    const setClause = updateKeys.map(k => `"${k}" = ?`).join(', ');
    const sql = `UPDATE "${tableName}" SET ${setClause} WHERE "${idColumn}" = ?`;
    
    // Values: [...updateValues, idValue]
    const values = updateKeys.map(k => data[k]);
    values.push(idValue);

    return this.executeSql(sql, values);
  }

  /**
   * Checks the JSON keys and types to generate a CREATE TABLE IF NOT EXISTS statement
   */
  private async ensureTableExists(tableName: string, row: Record<string, any>) {
    const columns = Object.keys(row).map(key => {
      const val = row[key];
      let type = 'TEXT'; // Default
      if (typeof val === 'number') type = 'REAL';
      else if (typeof val === 'boolean') type = 'INTEGER';
      
      return `"${key}" ${type}`;
    }).join(', ');

    const sql = `CREATE TABLE IF NOT EXISTS "${tableName}" (${columns})`;
    // We execute this directly. If table exists, sqlite ignores it.
    await this.executeSql(sql, []);
  }

  private generateInsertStatement(tableName: string, row: Record<string, any>) {
    const keys = Object.keys(row);
    const values = Object.values(row);
    const columns = keys.map(k => `"${k}"`).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO "${tableName}" (${columns}) VALUES (${placeholders})`;
    return { sql, values };
  }

  // ---------------------------------------------------------
  //  END NEW METHODS
  // ---------------------------------------------------------

  // Complex Object Start
  /**
   * Generic importer for complex nested JSON.
   * - Flattens nested objects (e.g. { price: { val: 1 } } -> price_val)
   * - Moves arrays to child tables (e.g. { images: [...] } -> Table 'parent_images')
   * - Preserves relationships via Foreign Keys
   * * @param tableName The name of the main table to start with (e.g. 'factory_products')
   * @param data The data object/array
   * @param parentKeyColumn (Optional) Name of the FK column for child tables (default: 'parent_id')
   * @param parentKeyValue (Optional) The value of the FK
   */
  public async importComplexData(
    tableName: string, 
    data: any, 
    parentKeyColumn: string | null = null, 
    parentKeyValue: string | null = null
  ): Promise<ImportResult | ImportResult[]> { // Change return type
    
    await this.waitForInitialization();

    // Case 1: Data is the root Dictionary (e.g. Factory GUIDs)
    if (!Array.isArray(data) && typeof data === 'object' && this.isDictionary(data)) {
      const results: ImportResult[] = [];
      for (const [key, value] of Object.entries(data)) {
        // Recursive call
        const res = await this.importComplexData(tableName, value, 'group_id', key);
        // Determine if res is array or single object to push correctly
        if (Array.isArray(res)) results.push(...res);
        else results.push(res);
      }
      
      // Aggregate results for the Dictionary case
      const totalInserted = results.reduce((acc, curr) => acc + curr.inserted, 0);
      const allChildren = results.reduce((acc, r) => acc.concat(r.children || []), [] as ImportResult[]);     

      return {
        table: tableName,
        inserted: totalInserted,
        children: allChildren // This might duplicate child stats if they are identical structures, but serves for logging
      };
    }

    // Case 2: Data is an Array of objects
    if (Array.isArray(data)) {
      const flatRows: any[] = [];
      const childTables: Record<string, any[]> = {};

      for (const item of data) {
        const { flatRow, children } = this.flattenObject(item);
        
        if (parentKeyColumn && parentKeyValue) {
          flatRow[parentKeyColumn] = parentKeyValue;
        }

        flatRows.push(flatRow);

        const rowId = flatRow['guid'] || flatRow['id'] || this.generateGuid();
        
        for (const [childName, childArray] of Object.entries(children)) {
            if(!childTables[childName]) childTables[childName] = [];
            (childArray as any[]).forEach(c => {
                 c[`${tableName}_guid`] = rowId; 
            });
            childTables[childName].push(...(childArray as any[]));
        }
      }

      // 1. Insert Main Rows
      if (flatRows.length > 0) {
        await this.insertFromJson(tableName, flatRows);
      }

      // 2. Process Children
      const childResults: ImportResult[] = [];
      for (const [childTableName, childRows] of Object.entries(childTables)) {
         const newTableName = `${tableName}_${childTableName}`;
         // Recursive call
         const childRes = await this.importComplexData(newTableName, childRows);
         if (Array.isArray(childRes)) childResults.push(...childRes);
         else childResults.push(childRes);
      }

      // Return the stats for this batch
      return {
        table: tableName,
        inserted: flatRows.length,
        children: childResults
      };
    }

    return { table: tableName, inserted: 0 };
  }
  // --- Helpers for the Generic Importer ---

  /**
   * Helper: Flattens 1-to-1 objects and extracts 1-to-Many arrays
   */
  private flattenObject(obj: any, prefix = '') {
    const flatRow: any = {};
    const children: Record<string, any[]> = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}_${key}` : key;

      if (Array.isArray(value)) {
        // It's an array -> It becomes a child table
        children[key] = value;
      } else if (value && typeof value === 'object') {
        // It's a nested object -> Flatten it (recursion)
        const { flatRow: nestedRow, children: nestedChildren } = this.flattenObject(value, newKey);
        Object.assign(flatRow, nestedRow);
        Object.assign(children, nestedChildren);
      } else {
        // It's a primitive (string, number, boolean) -> It stays in the row
        flatRow[newKey] = value;
      }
    }
    return { flatRow, children };
  }

  /**
   * Helper: Detects if an object is likely a Dictionary (Map) rather than a Data Row
   * Heuristic: If values are Arrays, it's likely a grouping dictionary.
   */
  private isDictionary(obj: any): boolean {
    const values = Object.values(obj);
    if (values.length > 0 && Array.isArray(values[0])) return true;
    return false;
  }
  // Complex Object End

  // Database Management Start
  /**
   * Deletes all records from a specific table.
   * usage: await this.webSqlite.clearTable('products');
   */
  public async clearTable(tableName: string) {
    await this.waitForInitialization();
    // We use DELETE FROM to remove data. 
    // We wrap tableName in quotes to handle special characters.
    const sql = `DELETE FROM "${tableName}"`;
    return this.executeSql(sql, []);
  }

  /**
   * COMPLETELY wipes the database.
   * Drops all tables so they can be re-created fresh.
   */
  public async clearDatabase() {
    await this.waitForInitialization();

    try {
      // 1. Get all table names (excluding internal sqlite_ tables)
      // const fetchTablesSql = `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`;
      const fetchTablesSql = `
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        AND name NOT LIKE 'sqlite_%' 
        AND name NOT IN ('_audit_log', '_security')
      `;
      const result = await this.executeSql(fetchTablesSql, []);

      if (result && result.rows && result.rows.length > 0) {
        const tables = result.rows.map((r: any) => r.name);
        
        console.log(`Dropping ${tables.length} tables:`, tables);

        // 2. Disable foreign key constraints temporarily to avoid errors 
        // (e.g. dropping a parent table before a child table)
        await this.executeSql('PRAGMA foreign_keys = OFF', []);

        // 3. Prepare Drop Statements
        const dropQueries = tables.map((name: string) => [`DROP TABLE IF EXISTS "${name}"`, []]);
        
        // 4. Execute Batch Drop
        await this.batchSql(dropQueries);

        // 5. Re-enable foreign keys
        await this.executeSql('PRAGMA foreign_keys = ON', []);
        
        // 6. Optional: VACUUM to reclaim disk space from the file
        await this.executeSql('VACUUM', []);

        return { success: true, tablesDropped: tables.length };
      }
      
      return { success: true, tablesDropped: 0 };
    } catch (e) {
      console.error('Error clearing database:', e);
      throw e;
    }
  }
  // Database Management End


  private messageReceived(message: MessageEvent) {
    const sqliteMessage: Message = message.data;
    if (sqliteMessage.id && this.queuedPromises.hasOwnProperty(sqliteMessage.id)) {
      const promise = this.queuedPromises[sqliteMessage.id];
      delete this.queuedPromises[sqliteMessage.id];
      switch (sqliteMessage.type) {
        case 'init':
          if (sqliteMessage.error) {
            return promise.reject(sqliteMessage.error);
          }
          this.isInitialized = true;
          return promise.resolve(sqliteMessage.filename);
        case 'executeSql':
          if (sqliteMessage.error) {
            return promise.reject(sqliteMessage.error);
          }
          return promise.resolve({ rows: sqliteMessage.rows });
        case 'export':
          debugger
          if (sqliteMessage.error) {
            return promise.reject(sqliteMessage.error);
          }
          return promise.resolve({ rows: sqliteMessage.rows });
        case 'batchSql':
          if (sqliteMessage.error) {
            return promise.reject(sqliteMessage.error);
          }
          return promise.resolve({ rowsAffected: sqliteMessage.rowsAffected });
        case 'batchReturnSql':
          if (sqliteMessage.error) {
            return promise.reject(sqliteMessage.error);
          }
          return promise.resolve({ rows: sqliteMessage.rows });
      }
    }
  }

  private async waitForInitialization() {
    while (!this.isInitialized) {
      console.log('waiting for initialization...');
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for 100 milliseconds before checking again
    }
  }

  private generateGuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}