import { FomoConnection, type RequestOptions, type ApiResult } from "../connection.js";
import { parseConfiguration, type AppConfiguration } from "../contracts/configuration.js";
import { parsedResult } from "../contracts/read.js";
export class AppResource {
  constructor(private readonly connection: FomoConnection) {}
  configuration(options: RequestOptions = {}): Promise<ApiResult<AppConfiguration>> {
    return parsedResult(
      this.connection.request("app.configuration", "/config", {}, options),
      parseConfiguration,
    );
  }
}
