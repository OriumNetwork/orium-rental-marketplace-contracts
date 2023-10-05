import mumbai from "./mumbai/index.json";
import polygon from "./polygon/index.json";

const config = {
    mumbai,
    polygon,
};

export default config;

export type Network = keyof typeof config;
