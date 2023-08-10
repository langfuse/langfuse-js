// uses the compiled node.js version, run yarn build after making changes to the SDKs
import Langfuse from '../langfuse-node'

// import { wait } from '../langfuse-core/test/test-utils/test-utils'
import axios from 'axios'

const LF_HOST = process.env.LF_HOST ?? 'http://localhost:3000'
const LF_PUBLIC_KEY = process.env.LF_PUBLIC_KEY ?? 'pk-lf-1234567890'
const LF_SECRET_KEY = process.env.LF_SECRET_KEY ?? 'sk-lf-1234567890'

const getHeaders = {
  Authorization: 'Basic ' + Buffer.from(`${LF_PUBLIC_KEY}:${LF_SECRET_KEY}`).toString('base64'),
}

describe('Langfuse Node.js', () => {
  let langfuse: Langfuse
  // jest.setTimeout(100000)
  jest.useRealTimers()

  beforeEach(() => {
    langfuse = new Langfuse({
      publicKey: LF_PUBLIC_KEY,
      secretKey: LF_SECRET_KEY,
      host: LF_HOST,
      flushAt: 100,
      fetchRetryDelay: 100,
      fetchRetryCount: 3,
    })
    langfuse.debug(true)
  })

  afterEach(async () => {
    // ensure clean shutdown & no test interdependencies
    await langfuse.shutdownAsync()
  })

  describe('core methods', () => {
    it('check health of langfuse server', async () => {
      const res = await axios
        .get(LF_HOST + '/api/public/health', { headers: getHeaders })
        .then((res) => res.data)
        .catch((err) => console.log(err))
      expect(res).toMatchObject({ status: 'OK' })
    })

    it('create trace', async () => {
      const trace = langfuse.trace({ name: 'trace-name' })
      await langfuse.flushAsync()
      // check from get api if trace is created
      const res = await axios.get(`${LF_HOST}/api/public/traces/${trace.id}`, { headers: getHeaders })
      expect(res.data).toMatchObject({ id: trace.id, name: 'trace-name' })
    })

    it('create span', async () => {
      const trace = langfuse.trace({ name: 'trace-name-span' })
      const span = trace.span({ name: 'span-name', startTime: new Date('2020-01-01T00:00:00.000Z') })
      await langfuse.flushAsync()
      // check from get api if trace is created
      const res = await axios.get(`${LF_HOST}/api/public/observations/${span.id}`, { headers: getHeaders })
      expect(res.data).toEqual({
        id: span.id,
        name: 'span-name',
        type: 'SPAN',
        startTime: new Date('2020-01-01T00:00:00.000Z').toISOString(),
        completionStartTime: null,
        endTime: null,
        metadata: null,
        model: null,
        modelParameters: null,
        input: null,
        output: null,
        level: 'DEFAULT',
        parentObservationId: null,
        completionTokens: 0,
        promptTokens: 0,
        totalTokens: 0,
        statusMessage: null,
        traceId: trace.id,
        version: null,
      })
    })

    it('create generation', async () => {
      const trace = langfuse.trace({ name: 'trace-name-generation-new' })
      const generation = trace.generation({ name: 'generation-name-new' })
      await langfuse.flushAsync()
      // check from get api if trace is created
      const res = await axios.get(`${LF_HOST}/api/public/observations/${generation.id}`, { headers: getHeaders })
      expect(res.data).toMatchObject({ id: generation.id, name: 'generation-name-new', type: 'GENERATION' })
    })

    it('create event', async () => {
      const trace = langfuse.trace({ name: 'trace-name-event' })
      const event = trace.event({ name: 'event-name' })
      await langfuse.flushAsync()

      // check from get api if trace is created
      const res = await axios.get(`${LF_HOST}/api/public/observations/${event.id}`, { headers: getHeaders })
      expect(res.data).toMatchObject({ id: event.id, name: 'event-name', type: 'EVENT' })
    })

    it('create event without creating trace before', async () => {
      const event = langfuse.event({ name: 'event-name' })
      await langfuse.flushAsync()

      // check from get api if trace is created
      const res = await axios.get(`${LF_HOST}/api/public/observations/${event.id}`, { headers: getHeaders })
      expect(res.data).toMatchObject({ id: event.id, name: 'event-name', type: 'EVENT' })
    })
  })
})
