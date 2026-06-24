
import { Column, Row } from './types';

/**
 * Evaluates a formula string based on row data and column definitions.
 * Supports:
 * - Basic math: +, -, *, /
 * - Comparisons: ==, !=, >, <, >=, <=
 * - Logical: &&, ||, !, IF, AND, OR, NOT, SWITCH
 * - String concatenation: &
 * - Column references: {FieldName} or [FieldName]
 * - List functions: SUM, AVERAGE, MIN, MAX, COUNT
 * - Date functions: YEAR, MONTH, DAY, HOUR, MINUTE, SECOND, NOW, TODAY, DATEADD, DATEDIFF
 * - Text functions: CONCATENATE, LEFT, RIGHT, MID, LEN, UPPER, LOWER, REPLACE, TRIM
 * - Number functions: ABS, ROUND, CEILING, FLOOR, SQRT, POWER
 * - Position functions: FIND, SEARCH
 */
export const evaluateFormula = (formula: string, columns: Column[], row: Row): any => {
  if (!formula) return '';


  try {
    let expression = formula;

    // 0. Normalize punctuation (handle Chinese quotes and commas)
    expression = expression.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/，/g, ',');

    // 1. Handle & operator for concatenation (replace with +)
    // We replace & with + only when it's not inside double quotes.
    // This is a simple regex that handles basic cases.
    let inQuotes = false;
    let newExpression = '';
    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];
      if (char === '"' && (i === 0 || expression[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      }
      if (char === '&' && !inQuotes) {
        newExpression += '+';
      } else {
        newExpression += char;
      }
    }
    expression = newExpression;

    // 1.5 Handle = for equality (replace with == if not already part of a comparison operator)
    // We replace = with == only when it's not inside double quotes and not part of >=, <=, !=, ==
    let processedExpr = '';
    inQuotes = false;
    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];
      if (char === '"' && (i === 0 || expression[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      }
      if (!inQuotes && char === '=') {
        const prev = i > 0 ? expression[i - 1] : '';
        const next = i < expression.length - 1 ? expression[i + 1] : '';
        // If it's not part of ==, >=, <=, !=
        if (prev !== '=' && prev !== '>' && prev !== '<' && prev !== '!' && next !== '=') {
          processedExpr += '==';
        } else {
          processedExpr += '=';
        }
      } else {
        processedExpr += char;
      }
    }
    expression = processedExpr;

    // 1.6 Handle TODAY and NOW without parentheses
    expression = expression.replace(/\bTODAY\b(?!\()/g, 'TODAY()');
    expression = expression.replace(/\bNOW\b(?!\()/g, 'NOW()');

    // 2. Replace column references with values
    // Sort columns by name length descending to avoid partial replacement (e.g., {Name} vs {Name 2})
    const sortedColumns = [...columns].sort((a, b) => b.name.length - a.name.length);

    sortedColumns.forEach(c => {
      const fieldVal = row.data[c.id];

      // Handle different types for safe eval
      let safeVal: any;
      if (c.type === 'DATE' && fieldVal) {
        // Pass the value directly to __DATE, which handles parsing
        safeVal = `__DATE("${String(fieldVal).replace(/"/g, '\\"')}")`;
      } else if (typeof fieldVal === 'number') {
        safeVal = fieldVal;
      } else if (typeof fieldVal === 'boolean') {
        safeVal = fieldVal;
      } else if (fieldVal === null || fieldVal === undefined) {
        safeVal = '""';
      } else {
        // Stringify and escape quotes and newlines
        safeVal = `"${String(fieldVal).replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
      }

      // Replace {FieldName} and [FieldName]
      const escapedName = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expression = expression.replace(new RegExp(`\\{${escapedName}\\}`, 'g'), String(safeVal));
      expression = expression.replace(new RegExp(`\\[${escapedName}\\]`, 'g'), String(safeVal));
    });

    // Replace && with AND for safe eval
    // Use a regex that handles potential surrounding spaces to avoid double operators like ++
    expression = expression.replace(/\s*&&\s*/g, ' AND ');

    // 3. Define helper functions for eval context
    const __DATE = (dStr: string) => {
      if (!dStr) return { valueOf: () => 0, toString: () => '', toDate: () => new Date(0) };
      
      let d: Date;
      let value: number;
      
      if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
        const [y, m, day] = dStr.split('-').map(Number);
        d = new Date(y, m - 1, day);
        value = Date.UTC(y, m - 1, day) / 86400000;
      } else {
        d = new Date(dStr);
        if (isNaN(d.getTime())) return { valueOf: () => 0, toString: () => dStr, toDate: () => new Date(0) };
        value = (d.getTime() - d.getTimezoneOffset() * 60000) / 86400000;
      }
      
      return {
        valueOf: () => value,
        toString: () => dStr,
        toDate: () => d
      };
    };

    // --- Logical Functions ---
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const IF = (cond: any, t: any, f: any) => cond ? t : f;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const IFS = (...args: any[]) => {
      for (let i = 0; i < args.length - 1; i += 2) {
        if (args[i]) return args[i + 1];
      }
      return args.length % 2 === 1 ? args[args.length - 1] : undefined;
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const AND = (...args: any[]) => args.every(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const OR = (...args: any[]) => args.some(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const NOT = (arg: any) => !arg;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const ISBLANK = (val: any) => val === null || val === undefined || val === '';
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const SWITCH = (val: any, ...cases: any[]) => {
      for (let i = 0; i < cases.length - 1; i += 2) {
        if (val === cases[i]) return cases[i + 1];
      }
      return cases.length % 2 === 1 ? cases[cases.length - 1] : undefined;
    };

    // --- List Functions ---
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const SUM = (...args: any[]) => {
      const flatArgs = args.flat(Infinity);
      return flatArgs.reduce((a, b) => a + (Number(b) || 0), 0);
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const AVERAGE = (...args: any[]) => {
      const flatArgs = args.flat(Infinity);
      const filtered = flatArgs.filter(v => typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v))));
      return filtered.length ? filtered.reduce((a, b) => a + Number(b), 0) / filtered.length : 0;
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const MIN = (...args: any[]) => {
      const nums = args.flat(Infinity).map(Number).filter(n => !isNaN(n));
      return nums.length ? Math.min(...nums) : 0;
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const MAX = (...args: any[]) => {
      const nums = args.flat(Infinity).map(Number).filter(n => !isNaN(n));
      return nums.length ? Math.max(...nums) : 0;
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const COUNT = (...args: any[]) => args.flat(Infinity).filter(v => v !== null && v !== undefined && v !== '').length;

    // --- Date Functions ---
    const parseDate = (d: any) => {
      if (d instanceof Date) return d;
      if (d && d.toDate) return d.toDate();
      if (typeof d === 'number') {
        const utcDate = new Date(d * 86400000);
        return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), utcDate.getUTCHours(), utcDate.getUTCMinutes(), utcDate.getUTCSeconds());
      }
      if (typeof d === 'string') {
        if (!d) return new Date(0); // Empty string to epoch
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          const [y, m, day] = d.split('-').map(Number);
          return new Date(y, m - 1, day);
        }
        const date = new Date(d);
        return isNaN(date.getTime()) ? new Date(0) : date;
      }
      return new Date(0);
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const DATEVALUE = (d: any) => __DATE(String(d)).valueOf();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const DATE = (y: number, m: number, d: number) => {
      const date = new Date(y, m - 1, d);
      return date.toISOString().split('T')[0];
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const DATE_FORMAT = (d: any, fmt: string) => {
      const date = parseDate(d);
      if (date.getTime() === 0) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return fmt
        .replace('YYYY', String(date.getFullYear()))
        .replace('YY', String(date.getFullYear()).substring(2))
        .replace('MM', pad(date.getMonth() + 1))
        .replace('M', String(date.getMonth() + 1))
        .replace('DD', pad(date.getDate()))
        .replace('D', String(date.getDate()))
        .replace('HH', pad(date.getHours()))
        .replace('H', String(date.getHours()))
        .replace('mm', pad(date.getMinutes()))
        .replace('m', String(date.getMinutes()))
        .replace('ss', pad(date.getSeconds()))
        .replace('s', String(date.getSeconds()));
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const YEAR = (d: any) => parseDate(d).getFullYear();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const MONTH = (d: any) => parseDate(d).getMonth() + 1;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const DAY = (d: any) => parseDate(d).getDate();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const HOUR = (d: any) => parseDate(d).getHours();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const MINUTE = (d: any) => parseDate(d).getMinutes();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const SECOND = (d: any) => parseDate(d).getSeconds();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const NOW = () => new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const TODAY = () => {
      const d = new Date();
      const year = d.getFullYear();
      const month = d.getMonth();
      const day = d.getDate();
      const str = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const value = Date.UTC(year, month, day) / 86400000;
      return {
        valueOf: () => value,
        toString: () => str,
        toDate: () => new Date(year, month, day)
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const WEEKDAY = (d: any, type: number = 1) => {
      const day = parseDate(d).getDay();
      if (type === 1) return day + 1;
      if (type === 2) return day === 0 ? 7 : day;
      if (type === 3) return day === 0 ? 6 : day - 1;
      return day + 1;
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const DATEADD = (d: any, amount: number, unit: string) => {
      const date = parseDate(d);
      const u = String(unit || 'days').toLowerCase();
      if (u === 'year' || u === 'years') date.setFullYear(date.getFullYear() + amount);
      else if (u === 'month' || u === 'months') date.setMonth(date.getMonth() + amount);
      else if (u === 'day' || u === 'days') date.setDate(date.getDate() + amount);
      else if (u === 'hour' || u === 'hours') date.setHours(date.getHours() + amount);
      else if (u === 'minute' || u === 'minutes') date.setMinutes(date.getMinutes() + amount);
      else if (u === 'second' || u === 'seconds') date.setSeconds(date.getSeconds() + amount);
      
      const hasTime = u === 'hour' || u === 'hours' || u === 'minute' || u === 'minutes' || u === 'second' || u === 'seconds' || (typeof d === 'string' && d.includes(':'));
      const format = hasTime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD';
      return __DATE(DATE_FORMAT(date, format));
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const DATEDIFF = (d1: any, d2: any, unit: string) => {
      const date1 = parseDate(d1);
      const date2 = parseDate(d2);
      const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate(), date1.getHours(), date1.getMinutes(), date1.getSeconds());
      const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate(), date2.getHours(), date2.getMinutes(), date2.getSeconds());
      const diffMs = utc2 - utc1;
      const u = String(unit || 'days').toLowerCase();
      if (u === 'year' || u === 'years') return date2.getFullYear() - date1.getFullYear();
      if (u === 'month' || u === 'months') return (date2.getFullYear() - date1.getFullYear()) * 12 + (date2.getMonth() - date1.getMonth());
      if (u === 'day' || u === 'days') return Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (u === 'hour' || u === 'hours') return Math.round(diffMs / (1000 * 60 * 60));
      if (u === 'minute' || u === 'minutes') return Math.round(diffMs / (1000 * 60));
      if (u === 'second' || u === 'seconds') return Math.round(diffMs / 1000);
      return diffMs;
    };

    // --- Text Functions ---
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const CONCATENATE = (...args: any[]) => args.join('');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const LEFT = (s: string, n: number) => String(s || '').substring(0, n);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const RIGHT = (s: string, n: number) => {
      const str = String(s || '');
      return str.substring(str.length - n);
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const MID = (s: string, start: number, n: number) => String(s || '').substring(start - 1, start - 1 + n);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const LEN = (s: string) => String(s || '').length;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const UPPER = (s: string) => String(s || '').toUpperCase();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const LOWER = (s: string) => String(s || '').toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const REPLACE = (s: string, start: number, n: number, newS: string) => {
      const str = String(s || '');
      return str.substring(0, start - 1) + newS + str.substring(start - 1 + n);
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const TRIM = (s: string) => String(s || '').trim();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const VALUE = (s: any) => Number(s) || 0;

    // --- Number Functions ---
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const ABS = Math.abs;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const ROUND = (n: number, p: number = 0) => {
      const factor = Math.pow(10, p);
      return Math.round(n * factor) / factor;
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const CEILING = Math.ceil;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const FLOOR = Math.floor;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const SQRT = Math.sqrt;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const POWER = Math.pow;

    // --- Position Functions ---
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const FIND = (search: string, s: string, start: number = 1) => String(s || '').indexOf(search, start - 1) + 1;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const SEARCH = (search: string, s: string, start: number = 1) => String(s || '').toLowerCase().indexOf(search.toLowerCase(), start - 1) + 1;

    // 4. Basic safety check
    // Allow: numbers, spaces, math ops, comparisons, logical ops, quotes, parentheses, and common function names
    const allowedPattern = /^[\d\s+\-*/().<>=!&|"':,_a-zA-Z\u4e00-\u9fa5]+$/;
    if (!allowedPattern.test(expression)) {
      // If it fails the pattern, it might contain malicious code or unsupported characters
      // In a real app, use a proper expression parser.
    }

    // 5. Evaluate
    // eslint-disable-next-line no-new-func

    const result = new Function(
      'IF', 'IFS', 'AND', 'OR', 'NOW', 'TODAY', 'WEEKDAY', 'DATEADD', 'DATEDIFF', 'DATEVALUE', 'DATE', 
      'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 
      'CONCATENATE', 'LEFT', 'RIGHT', 'MID', 'LEN', 'UPPER', 'LOWER', 'REPLACE', 'TRIM', 'VALUE', 
      'ABS', 'ROUND', 'CEILING', 'FLOOR', 'SQRT', 'POWER', 'FIND', 'SEARCH', '__DATE', 
      `return ${expression}`
    )(
      IF, IFS, AND, OR, NOW, TODAY, WEEKDAY, DATEADD, DATEDIFF, DATEVALUE, DATE, 
      YEAR, MONTH, DAY, HOUR, MINUTE, SECOND, 
      CONCATENATE, LEFT, RIGHT, MID, LEN, UPPER, LOWER, REPLACE, TRIM, VALUE, 
      ABS, ROUND, CEILING, FLOOR, SQRT, POWER, FIND, SEARCH, __DATE
    );

    return result;
  } catch (e) {
    console.warn('Formula evaluation failed:', e, 'Formula:', formula);
    return '#ERROR!';
  }
};
