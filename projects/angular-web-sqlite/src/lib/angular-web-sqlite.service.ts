/* eslint-disable one-var */
/* eslint-disable no-bitwise */
/* eslint-disable object-shorthand */
import '@angular/compiler';
import { Injectable } from '@angular/core';

export interface Message {
  type: 'init' | 'executeSql' | 'batchSql' | 'batchReturnSql' | 'export';
  id: string;
  flags?: string;
  filename?: string;
  error?: any;
  sql?: string;
  param?: any;
  sqls?: any;
  rows?: any;
  rowsAffected?: number;
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

  init(dbName: string, flags?: string) {
    this.worker = new Worker(this.sqliteClientWorkerPath, { type: 'module' });
    this.worker.onmessage = this.messageReceived.bind(this);
    this.filename = `/${dbName}.sqlite3`;
    const initDb: Message = { type: 'init', filename: this.filename, flags: flags || 'ct', id: this.generateGuid() };
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
  public async exportDb() {
    await this.waitForInitialization();
    
    const exportMsg: Message = { 
        type: 'export', 
        filename: this.filename, 
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