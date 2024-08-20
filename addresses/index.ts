import moonbeam from './moonbeam/index.json'
import polygon from './polygon/index.json'
import cronosTestnet from './cronosTestnet/index.json'
import cronos from './cronos/index.json'
import arbitrum from './arbitrum/index.json'

const config = {
  moonbeam,
  polygon,
  cronosTestnet,
  cronos,
  arbitrum,
}

export default config

export type Network = keyof typeof config
