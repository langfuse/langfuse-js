import Langfuse from 'langfuse-node'
// @ts-ignore
import wtf from 'wtfnode'

const {
  LF_PUBLIC = 'pk-lf-1234567890',
  LF_SECRET = 'sk-lf-1234567890',
  LF_HOST = 'http://localhost:3000',
} = process.env

const langfuse = new Langfuse(LF_PUBLIC, LF_SECRET, {
  host: LF_HOST,
  // flushAt: 1,
})

langfuse.trace({
  name: 'test-trace',
})

async function cleanup() {
  wtf.dump()
  await langfuse.shutdownAsync()
  wtf.dump()
  console.log('shut down successfully')
}

cleanup()
