import { parseBody } from './test-utils/test-utils'
import {
  createTestClient,
  LangfuseCoreTestClient,
  LangfuseCoreTestClientMocks,
} from './test-utils/LangfuseCoreTestClient'

describe('Langfuse Core', () => {
  let langfuse: LangfuseCoreTestClient
  let mocks: LangfuseCoreTestClientMocks

  jest.useFakeTimers()

  beforeEach(() => {
    ;[langfuse, mocks] = createTestClient({
      publicKey: 'pk-lf-111',
      secretKey: 'sk-lf-111',
      flushAt: 1,
    })
  })

  describe('traces', () => {
    it('should create a trace', async () => {
      jest.setSystemTime(new Date('2022-01-01'))

      langfuse.trace({
        name: 'test-trace',
      })

      expect(mocks.fetch).toHaveBeenCalledTimes(1)
      const [url, options] = mocks.fetch.mock.calls[0]
      expect(url).toMatch(/^https:\/\/cloud\.langfuse\.com\/api\/public\/traces$/)
      expect(options.method).toBe('POST')
      const body = parseBody(mocks.fetch.mock.calls[0])

      expect(body).toMatchObject({
        name: 'test-trace',
      })
    })

    it('should allow overridding the id', async () => {
      langfuse.trace({
        id: '123456789',
      })

      const body = parseBody(mocks.fetch.mock.calls[0])

      expect(body).toEqual({
        id: '123456789',
      })
    })

    it('test all params', async () => {
      jest.setSystemTime(new Date('2022-01-01'))

      langfuse.trace({
        name: 'test-trace',
        id: '123456789',
        metadata: {
          test: 'test',
          mira: {
            hello: 'world',
          },
        },
        version: '1.0.0',
      })

      expect(mocks.fetch).toHaveBeenCalledTimes(1)
      const body = parseBody(mocks.fetch.mock.calls[0])
      expect(body).toMatchObject({
        name: 'test-trace',
        id: '123456789',
        metadata: {
          test: 'test',
          mira: {
            hello: 'world',
          },
        },
        version: '1.0.0',
      })
    })
  })
})
