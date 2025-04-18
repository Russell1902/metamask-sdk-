import { RemoteCommunicationPostMessageStream } from '../../PostMessageStream/RemoteCommunicationPostMessageStream'; // Adjust the import based on your project structure
import { MAX_MESSAGE_LENGTH, METHODS_TO_REDIRECT } from '../../config';
import * as loggerModule from '../../utils/logger'; // Adjust the import based on your project structure
import { Ethereum } from '../Ethereum'; // Adjust the import based on your project structure
import { extractMethod } from './extractMethod';
import { write } from './write'; // Adjust the import based on your project structure

jest.mock('./extractMethod');
jest.mock('../Ethereum');

describe('write function', () => {
  const spyLogger = jest.spyOn(loggerModule, 'logger');
  const mockExtractMethod = extractMethod as jest.Mock;
  const mockEthereum = Ethereum.getProvider as jest.Mock;
  const mockIsReady = jest.fn();
  const mockIsConnected = jest.fn();
  const mockIsPaused = jest.fn();
  const mockGetChannelId = jest.fn();
  const mockIsAuthorized = jest.fn();
  const mockIsMobileWeb = jest.fn();
  const mockSendMessage = jest.fn(
    () =>
      new Promise((resolve) => {
        resolve('some_response');
      }),
  );
  const mockGetKeyInfo = jest.fn();
  const mockIsSecure = jest.fn();
  const mockOpenDeeplink = jest.fn();
  const mockIsMetaMaskInstalled = jest.fn();
  const isProviderConnected = jest.fn();
  const mockHasDeeplinkProtocol = jest.fn();

  let mockRemoteCommunicationPostMessageStream = {
    state: {
      remote: {
        isReady: mockIsReady,
        isConnected: mockIsConnected,
        isPaused: mockIsPaused,
        getChannelId: mockGetChannelId,
        isAuthorized: mockIsAuthorized,
        sendMessage: mockSendMessage,
        getKeyInfo: mockGetKeyInfo,
        hasDeeplinkProtocol: mockHasDeeplinkProtocol,
      },
      platformManager: {
        isSecure: mockIsSecure,
        isMobileWeb: mockIsMobileWeb,
        openDeeplink: mockOpenDeeplink,
        isMetaMaskInstalled: mockIsMetaMaskInstalled,
      },
      debug: false,
    },
  } as unknown as jest.Mocked<RemoteCommunicationPostMessageStream>;

  let callback: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    callback = jest.fn();

    mockIsMobileWeb.mockReturnValue(false);
    mockIsMetaMaskInstalled.mockReturnValue(true);

    mockEthereum.mockReturnValue({
      isConnected: isProviderConnected,
    });

    mockExtractMethod.mockReturnValue({
      method: 'metamask_getProviderState',
      data: { data: {} },
    });

    mockRemoteCommunicationPostMessageStream = {
      state: {
        remote: {
          isReady: mockIsReady,
          isConnected: mockIsConnected,
          isPaused: mockIsPaused,
          getChannelId: mockGetChannelId,
          isAuthorized: mockIsAuthorized,
          sendMessage: mockSendMessage,
          getKeyInfo: mockGetKeyInfo,
          hasDeeplinkProtocol: mockHasDeeplinkProtocol,
        },
        platformManager: {
          isSecure: mockIsSecure,
          openDeeplink: mockOpenDeeplink,
          isMobileWeb: mockIsMobileWeb,
          isMetaMaskInstalled: mockIsMetaMaskInstalled,
        },
        debug: false,
      },
    } as unknown as jest.Mocked<RemoteCommunicationPostMessageStream>;
  });

  describe('When No Channel ID', () => {
    it('should call the callback immediately if channelId is undefined', async () => {
      mockGetChannelId.mockReturnValue(undefined);

      await write(
        mockRemoteCommunicationPostMessageStream,
        {},
        'utf8',
        callback,
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(new Error('disconnected'));
    });

    it('should log when method is not METAMASK_GETPROVIDERSTATE', async () => {
      mockExtractMethod.mockReturnValue({});

      mockGetChannelId.mockReturnValue(undefined);

      await write(
        mockRemoteCommunicationPostMessageStream,
        { jsonrpc: '2.0', method: 'some_other_method' },
        'utf8',
        callback,
      );

      // First call is general log, 2nd call is the error log
      expect(spyLogger).toHaveBeenCalledTimes(2);
    });
  });

  describe('Connection Status', () => {
    beforeEach(() => {
      mockIsSecure.mockReturnValue(true);
      mockIsMobileWeb.mockReturnValue(false);
    });

    it('should debug log if both ready and socketConnected are true', async () => {
      mockIsReady.mockReturnValue(true);
      mockIsConnected.mockReturnValue(true);
      mockGetChannelId.mockReturnValue('some_channel_id');

      await write(
        mockRemoteCommunicationPostMessageStream,
        { jsonrpc: '2.0', method: 'some_method' },
        'utf8',
        callback,
      );

      expect(spyLogger).toHaveBeenCalledWith(
        expect.stringContaining(
          "[RCPMS: write()] method='metamask_getProviderState' isRemoteReady=true",
        ),
        expect.anything(),
      );
    });
  });

  describe('Redirect Links and Paused State', () => {
    beforeEach(() => {
      mockIsReady.mockReturnValue(true);
      mockIsConnected.mockReturnValue(true);
      mockIsAuthorized.mockReturnValue(true);
      mockIsMobileWeb.mockReturnValue(false);
      mockIsSecure.mockReturnValue(true);
      mockGetChannelId.mockReturnValue('some_channel_id');
      mockIsMetaMaskInstalled.mockReturnValue(true);
      mockGetKeyInfo.mockReturnValue({ ecies: { public: 'test_public_key' } });
      mockHasDeeplinkProtocol.mockReturnValue(false);
    });

    it('should redirect if method exists in METHODS_TO_REDIRECT', async () => {
      mockExtractMethod.mockReturnValue({
        method: Object.keys(METHODS_TO_REDIRECT)[0],
        data: {
          data: {
            jsonrpc: '2.0',
            method: Object.keys(METHODS_TO_REDIRECT)[0],
            params: [],
          },
        },
        triggeredInstaller: false,
      });

      await write(
        mockRemoteCommunicationPostMessageStream,
        { jsonrpc: '2.0', method: 'some_method' },
        'utf8',
        callback,
      );

      expect(mockOpenDeeplink).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://metamask.app.link/connect?channelId=some_channel_id',
        ),
        expect.stringContaining('metamask://connect?channelId=some_channel_id'),
        '_self',
      );
    });

    it('should create a deeplink if remote is paused', async () => {
      mockIsPaused.mockReturnValue(true);

      await write(
        mockRemoteCommunicationPostMessageStream,
        { jsonrpc: '2.0', method: 'some_method' },
        'utf8',
        callback,
      );

      expect(mockOpenDeeplink).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://metamask.app.link/connect?redirect=true&channelId=some_channel_id',
        ),
        expect.stringContaining(
          'metamask://connect?redirect=true&channelId=some_channel_id',
        ),
        '_self',
      );
    });
  });

  describe('Callbacks and Logging', () => {
    it('should call the callback once if everything is fine', async () => {
      mockIsReady.mockReturnValue(true);
      mockIsConnected.mockReturnValue(true);
      mockIsMobileWeb.mockReturnValue(false);
      mockGetChannelId.mockReturnValue('some_channel_id');

      await write(
        mockRemoteCommunicationPostMessageStream,
        { jsonrpc: '2.0', method: 'some_method' },
        'utf8',
        callback,
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith();
    });

    it('should log debug messages if debug is enabled', async () => {
      mockIsReady.mockReturnValue(true);
      mockIsConnected.mockReturnValue(true);

      await write(
        mockRemoteCommunicationPostMessageStream,
        { jsonrpc: '2.0', method: 'some_method' },
        'utf8',
        callback,
      );

      expect(spyLogger).toHaveBeenCalled();
    });
  });

  describe('Message Size Validation', () => {
    it('should reject messages exceeding MAX_MESSAGE_LENGTH', async () => {
      mockGetChannelId.mockReturnValue('some_channel_id');
      mockIsReady.mockReturnValue(true);
      mockIsConnected.mockReturnValue(true);

      // Mock extractMethod to return large data
      const largeData = {
        jsonrpc: '2.0',
        method: 'eth_call',
        params: ['x'.repeat(MAX_MESSAGE_LENGTH + 1)],
      };

      mockExtractMethod.mockReturnValue({
        method: 'eth_call',
        data: {
          data: largeData,
        },
      });

      await write(
        mockRemoteCommunicationPostMessageStream,
        { jsonrpc: '2.0', method: 'eth_call' },
        'utf8',
        callback,
      );

      // Don't test for exact error message, just verify it contains the key parts
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(
            /Message size \d+ exceeds maximum allowed size of \d+ bytes/u,
          ),
        }),
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should accept messages within MAX_MESSAGE_LENGTH', async () => {
      mockGetChannelId.mockReturnValue('some_channel_id');
      mockIsReady.mockReturnValue(true);
      mockIsConnected.mockReturnValue(true);

      // Mock extractMethod to return valid-sized data
      mockExtractMethod.mockReturnValue({
        method: 'eth_call',
        data: {
          data: {
            jsonrpc: '2.0',
            method: 'eth_call',
            params: ['x'.repeat(100)],
          },
        },
      });

      await write(
        mockRemoteCommunicationPostMessageStream,
        { jsonrpc: '2.0', method: 'eth_call' },
        'utf8',
        callback,
      );

      expect(callback).toHaveBeenCalledWith();
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });
});
