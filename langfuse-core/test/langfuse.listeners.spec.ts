import { waitForPromises } from './test-utils/test-utils'
import {
  createTestClient,
  LangfuseCoreTestClient,
  LangfuseCoreTestClientMocks,
} from './test-utils/LangfuseCoreTestClient'

describe('Langfuse Core', () => {
  let langfuse: LangfuseCoreTestClient
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let mocks: LangfuseCoreTestClientMocks

  jest.useFakeTimers()
  jest.setSystemTime(new Date('2022-01-01'))

  beforeEach(() => {
    ;[langfuse, mocks] = createTestClient({
      publicKey: 'pk-lf-111',
      secretKey: 'sk-lf-111',
      flushAt: 10,
    })
  })

  describe('on', () => {
    it('should listen to various events', () => {
      const mock = jest.fn()
      const mockOther = jest.fn()
      const mockOther2 = jest.fn()
      langfuse.on('createTrace', mock)
      langfuse.on('createTrace', mockOther)
      langfuse.on('somethingElse', mockOther2)

      langfuse.trace({ name: 'test-trace' })
      expect(mock).toHaveBeenCalledTimes(1)
      expect(mockOther).toHaveBeenCalledTimes(1)
      expect(mockOther2).toHaveBeenCalledTimes(0)
      expect(mock.mock.lastCall[0]).toMatchObject({ name: 'test-trace' })
    })

    it('should unsubscribe when called', () => {
      const mock = jest.fn()
      const unsubscribe = langfuse.on('createTrace', mock)

      langfuse.trace({ name: 'test-trace1' })
      expect(mock).toHaveBeenCalledTimes(1)
      langfuse.trace({ name: 'test-trace2' })
      expect(mock).toHaveBeenCalledTimes(2)
      unsubscribe()
      langfuse.trace({ name: 'test-trace3' })
      expect(mock).toHaveBeenCalledTimes(2)
    })

    it('should subscribe to flush events', async () => {
      const mock = jest.fn()
      langfuse.on('flush', mock)
      langfuse.trace({ name: 'test-trace' })
      expect(mock).toHaveBeenCalledTimes(0)
      jest.runOnlyPendingTimers()
      await waitForPromises()
      expect(mock).toHaveBeenCalledTimes(1)
    })
  })
})
