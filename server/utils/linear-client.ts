import { LinearClient } from '@linear/sdk'

export function getLinearClient(apiKey: string): LinearClient {
  return new LinearClient({ apiKey })
}
