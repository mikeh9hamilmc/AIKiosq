import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiLiveService } from '../geminiService';
import { LessonStage } from '../../types';

// Mock dependencies using vi.hoisted to avoid TDZ issues
const { mockConnect, mockSendToolResponse, mockSendRealtimeInput, mockSendClientContent } = vi.hoisted(() => {
    return {
        mockConnect: vi.fn(),
        mockSendToolResponse: vi.fn(),
        mockSendRealtimeInput: vi.fn(),
        mockSendClientContent: vi.fn()
    }
});

vi.mock('@google/genai', () => {
    class MockGoogleGenAI {
        live = {
            connect: mockConnect
        };
        constructor(config: any) { }
    }

    return {
        GoogleGenAI: MockGoogleGenAI,
        Modality: { AUDIO: 'AUDIO' },
        Type: { OBJECT: 'OBJECT', STRING: 'STRING' }
    };
});

// Mock Browser APIs
const { mockAudioContext } = vi.hoisted(() => {
    return {
        mockAudioContext: {
            createGain: vi.fn().mockReturnValue({ connect: vi.fn() }),
            createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
            createScriptProcessor: vi.fn().mockReturnValue({
                connect: vi.fn(),
                onaudioprocess: null
            }),
            createBufferSource: vi.fn().mockReturnValue({
                connect: vi.fn(),
                start: vi.fn(),
                addEventListener: vi.fn(),
                buffer: null
            }),
            decodeAudioData: vi.fn(),
            close: vi.fn().mockResolvedValue(undefined),
            destination: {},
            currentTime: 0
        }
    }
});

// @ts-ignore
window.AudioContext = class {
    constructor() {
        return mockAudioContext;
    }
};

// Mock MediaStream
const mockStream = {
    getVideoTracks: vi.fn().mockReturnValue([{}]),
    getAudioTracks: vi.fn().mockReturnValue([{}])
} as unknown as MediaStream;

describe('GeminiLiveService', () => {
    let service: GeminiLiveService;
    let callbacks: any;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new GeminiLiveService();
        callbacks = {
            onStageChange: vi.fn(),
            onStatusChange: vi.fn(),
            onPlayCompressionDemo: vi.fn(),
            onAnalyzePart: vi.fn().mockResolvedValue(undefined),
            onCheckInventory: vi.fn().mockResolvedValue(undefined),
            onShowAisleSign: vi.fn(),
            onSessionEnd: vi.fn()
        };

        // Setup successful connection mock
        mockConnect.mockResolvedValue({
            sendToolResponse: mockSendToolResponse,
            sendRealtimeInput: mockSendRealtimeInput,
            sendClientContent: mockSendClientContent
        });

        process.env.API_KEY = 'test-key';
    });

    it('connects to Gemini Live API on start', async () => {
        await service.start(callbacks, mockStream);
        expect(mockConnect).toHaveBeenCalled();
        expect(callbacks.onStatusChange).toHaveBeenCalledWith(expect.stringContaining('Connecting'));
    });

    it('handles connection errors', async () => {
        mockConnect.mockRejectedValue(new Error('Connection failed'));
        await service.start(callbacks, mockStream);
        expect(callbacks.onStatusChange).toHaveBeenCalledWith(expect.stringContaining('Connection Failed'));
    });

    it('handles tool calls correctly', async () => {
        // We need to capture the config object passed to connect to inspect callbacks
        // But since we can't easily trigger the internal callbacks from outside without exposing them or complex mocking,
        // we might verify that the tools are declared in the config.

        await service.start(callbacks, mockStream);
        const connectConfig = mockConnect.mock.calls[0][0];
        expect(connectConfig.config.tools[0].functionDeclarations).toHaveLength(3);

        // Simulating a tool call would require extracting the 'onmessage' handler from the connect call options
        // and invoking it manually.
        const onMessage = connectConfig.callbacks.onmessage;

        // Simulate analyze_part tool call
        const toolCallMessage = {
            toolCall: {
                functionCalls: [{
                    id: 'call-123',
                    name: 'analyze_part',
                    args: { userQuestion: 'fix leak' }
                }]
            }
        };

        await onMessage(toolCallMessage);

        // Verify sendToolResponse called immediately (fire and forget pattern in code)
        // Wait... the code does: this.sessionPromise?.then...
        // We need to wait for promises to flush.
        await new Promise(process.nextTick);

        expect(mockSendToolResponse).toHaveBeenCalledWith(expect.objectContaining({
            functionResponses: expect.arrayContaining([
                expect.objectContaining({ name: 'analyze_part' })
            ])
        }));

        expect(callbacks.onAnalyzePart).toHaveBeenCalledWith('', 'fix leak');
    });

    it('disconnects and cleans up resources', async () => {
        await service.start(callbacks, mockStream);
        await service.disconnect();
        expect(mockAudioContext.close).toHaveBeenCalled();
    });
});
