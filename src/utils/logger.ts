class StructuredLogger {
  private format(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, meta?: any) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      environment: process.env.NODE_ENV || 'development',
      ...meta
    });
  }

  info(message: string, meta?: any) {
    console.log(this.format('INFO', message, meta));
  }

  warn(message: string, meta?: any) {
    console.warn(this.format('WARN', message, meta));
  }

  error(message: string, error?: any, meta?: any) {
    const errorDetails = error instanceof Error 
      ? { name: error.name, message: error.message, stack: error.stack } 
      : error;
    console.error(this.format('ERROR', message, { error: errorDetails, ...meta }));
  }

  debug(message: string, meta?: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(this.format('DEBUG', message, meta));
    }
  }
}

export const logger = new StructuredLogger();
export default logger;
