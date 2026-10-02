import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Мини-хранилище в JSON-файле. Для демо хватает; для продакшена заменить на PostgreSQL. */
export class JsonDb<T extends object> {
  data: T;
  private timer: NodeJS.Timeout | null = null;

  constructor(private file: string, initial: T) {
    mkdirSync(dirname(file), { recursive: true });
    this.data = existsSync(file) ? { ...initial, ...JSON.parse(readFileSync(file, "utf8")) } : initial;
  }

  /** Запись с задержкой, чтобы не писать файл на каждое изменение */
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 200);
    this.timer.unref();
  }

  flush() {
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file); // атомарная замена, файл не останется наполовину записанным
  }
}
