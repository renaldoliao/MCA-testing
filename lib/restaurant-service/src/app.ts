import express, { type ErrorRequestHandler } from "express";
import { restaurantRouter } from "./index";
import { ensureTables } from "./setup";

export function createRestaurantApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use("/api/staff/photos", express.json({ limit: "1mb" })); // dish photos are larger than other requests
  app.use(express.json({ limit: "32kb" }));
  app.get("/api/healthz", (_req, res) => { res.json({ status: "ok" }); });
  app.use("/api", (_req, _res, next) => { ensureTables().then(() => next(), next); });
  app.use("/api", restaurantRouter);
  app.use("/api", (_req, res) => { res.status(404).json({ error: "API endpoint not found." }); });
  const handleError: ErrorRequestHandler = (error, req, res, _next) => {
    const log = (req as typeof req & { log?: { error: (data: object, message: string) => void } }).log;
    log?.error({ code: error?.code || "SERVICE_ERROR" }, "Shared service request failed");
    res.status(error?.status === 413 ? 413 : error?.status === 400 ? 400 : 503).json({
      error: error?.status === 413 ? "Submission is too large." : error?.status === 400 ? "Invalid JSON submission." : "Shared service unavailable. Your submission has not been confirmed. Retry safely.",
    });
  };
  app.use(handleError);
  return app;
}
