export interface ApplicationConfiguration {
  app: {
    port: number;
    nodeEnv: string;
    corsOrigin: string;
  };
  swagger: {
    enabled: boolean;
  };
  database: {
    url?: string;
    ssl: boolean;
    poolMax: number;
  };
  jwt: {
    secret?: string;
    expiresIn: string;
  };
  tally: {
    connectorId?: string;
    connectorSecret?: string;
  };
}

export default (): ApplicationConfiguration => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return {
    app: {
      port: Number.parseInt(process.env.PORT ?? '3000', 10),
      nodeEnv,
      corsOrigin:
        process.env.CORS_ORIGIN ?? (nodeEnv === 'production' ? '' : '*'),
    },
    swagger: {
      enabled:
        process.env.SWAGGER_ENABLED === 'true' ||
        (process.env.SWAGGER_ENABLED === undefined && nodeEnv !== 'production'),
    },
    database: {
      url: process.env.DATABASE_URL,
      // Neon requires TLS in every environment, including local development.
      // DATABASE_SSL permits an explicit override for a local PostgreSQL server.
      ssl:
        process.env.DATABASE_SSL === 'true' ||
        (process.env.DATABASE_SSL === undefined &&
          (process.env.DATABASE_URL?.includes('.neon.tech') ?? false)) ||
        ((process.env.NODE_ENV ?? 'development') === 'production' &&
          process.env.DATABASE_SSL !== 'false'),
      poolMax: 10,
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN ?? process.env.JWT_EXPIRES ?? '15d',
    },
    tally: {
      connectorId: process.env.TALLY_CONNECTOR_ID,
      connectorSecret: process.env.TALLY_CONNECTOR_SECRET,
    },
  };
};
