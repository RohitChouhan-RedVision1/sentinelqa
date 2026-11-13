import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

let cached = globalThis.__sentinelMongo;
if (!cached) cached = globalThis.__sentinelMongo = { conn: null, promise: null };

export async function connectDb() {
  if (!MONGODB_URI) return null;
  if (cached.conn) return cached.conn;
  if (!cached.promise) cached.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false });
  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }
  return cached.conn;
}
