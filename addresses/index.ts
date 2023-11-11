import mumbai from './mumbai/index.json'
import polygon from './polygon/index.json'
import cronosTestnet from './cronosTestnet/index.json'
import cronos from './cronos/index.json'

const config = {
  mumbai,
  polygon,
  cronosTestnet,
  cronos,
}

export default config

export type Network = keyof typeof config
