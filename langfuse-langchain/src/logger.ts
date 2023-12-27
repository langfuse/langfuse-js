import winston from "winston";

export const createLogger = (debug: boolean): winston.Logger =>
  winston.createLogger({
    format: winston.format.json(),
    transports: [new winston.transports.Console()],
    level: debug ? "debug" : "info",
  });
