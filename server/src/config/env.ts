import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: (process.env.MONGODB_URI || '').trim(),
  jwtSecret: process.env.JWT_SECRET || 'passline_dev_access_secret_change_in_prod_928374',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'passline_dev_refresh_secret_change_in_prod_514233',
  demoMode: process.env.DEMO_MODE !== 'false',
  restaurantName: process.env.RESTAURANT_NAME || 'Linden & Rye',
  taxRate: Number(process.env.TAX_RATE || 0.08),
  corsOrigin: (process.env.CORS_ORIGIN || '').trim(),
  appUrl: (process.env.APP_URL || '').trim(),
};
