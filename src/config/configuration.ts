export interface ApplicationConfiguration {
  app: {
    port: number;
    nodeEnv: string;
    corsOrigin: string;
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

export default (): ApplicationConfiguration => ({
  app: {
    port: Number.parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
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
    expiresIn: process.env.JWT_EXPIRES ?? '15d',
  },
  tally: {
    connectorId: process.env.TALLY_CONNECTOR_ID,
    connectorSecret: process.env.TALLY_CONNECTOR_SECRET,
  },
});
