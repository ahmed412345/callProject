import { RestClient } from "@signalwire/compatibility-api";
import "dotenv/config";

const client = RestClient(
    process.env.SIGNALWIRE_PROJECT_ID,
    process.env.SIGNALWIRE_API_TOKEN,
    { signalwireSpaceUrl: process.env.SIGNALWIRE_SPACE },
);

export default client;
