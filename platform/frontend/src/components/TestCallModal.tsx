import '@livekit/components-styles';
import { useEffect, useRef, useState } from 'react';
import { Room, ConnectionState } from 'livekit-client';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';

type CallState = 'idle' | 'connecting' | 'connected' | 'ended' | 'error';

function AudioBars() {
  return (
    <div className="flex items-end gap-1 h-8">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 rounded-full bg-emerald-500 animate-pulse"
          style={{
            height: `${[60, 100, 75][i]}%`,
            animationDelay: `${i * 150}ms`,
            animationDuration: '900ms',
          }}
        />
      ))}
    </div>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

interface Props {
  agentId: string;
  agentName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TestCallModal({ agentId, agentName, isOpen, onClose }: Props) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const agentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const disconnectRoom = () => {
    stopTimer();
    if (agentTimeoutRef.current) { clearTimeout(agentTimeoutRef.current); agentTimeoutRef.current = null; }
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
  };

  // Clean up on modal close or unmount
  useEffect(() => {
    if (!isOpen) disconnectRoom();
    return () => disconnectRoom();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCall = async () => {
    setCallState('connecting');
    setErrorMsg('');
    setDuration(0);

    try {
      const res = await api.post<{ roomName: string; token: string; livekitUrl: string }>(
        `/api/agents/${agentId}/test-call`,
        {}
      );

      const room = new Room();
      roomRef.current = room;

      // 15-second timeout waiting for agent to join
      agentTimeoutRef.current = setTimeout(() => {
        if (callState !== 'connected') {
          disconnectRoom();
          setCallState('error');
          setErrorMsg('Agent failed to connect — make sure the agent worker is running');
        }
      }, 15000);

      room.on('participantConnected', () => {
        if (agentTimeoutRef.current) { clearTimeout(agentTimeoutRef.current); agentTimeoutRef.current = null; }
      });

      room.on('disconnected', () => {
        stopTimer();
        setCallState((prev) => (prev === 'connected' ? 'ended' : prev));
      });

      await room.connect(res.livekitUrl, res.token);
      await room.localParticipant.setMicrophoneEnabled(true);

      setCallState('connected');
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err: unknown) {
      disconnectRoom();
      setCallState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to connect');
    }
  };

  const endCall = () => {
    disconnectRoom();
    setCallState('ended');
  };

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const next = !muted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  const reset = () => {
    setCallState('idle');
    setErrorMsg('');
    setDuration(0);
    setMuted(false);
  };

  const handleClose = () => {
    disconnectRoom();
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Test Call — {agentName}
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {callState === 'idle' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Click Start to connect to <span className="font-medium text-foreground">{agentName}</span>.
                Make sure your microphone is allowed in the browser.
              </p>
              <Button className="w-full" onClick={startCall}>
                <Phone className="h-4 w-4 mr-2" />
                Start Test Call
              </Button>
            </div>
          )}

          {callState === 'connecting' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm text-muted-foreground">Connecting to {agentName}...</p>
            </div>
          )}

          {callState === 'connected' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Connected — speak normally
                  </span>
                </div>
                <AudioBars />
              </div>

              <div className="flex items-center justify-between px-1">
                <span className="text-2xl font-mono font-semibold tabular-nums">
                  {formatDuration(duration)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    onClick={toggleMute}
                    title={muted ? 'Unmute' : 'Mute'}
                  >
                    {muted ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-10 w-10"
                    onClick={endCall}
                    title="End Call"
                  >
                    <PhoneOff className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {callState === 'ended' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
                <p className="text-sm font-medium">Call ended</p>
                <p className="text-xs text-muted-foreground mt-0.5">Duration: {formatDuration(duration)}</p>
              </div>
              <Button className="w-full" variant="outline" onClick={reset}>
                Start Another
              </Button>
            </div>
          )}

          {callState === 'error' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-sm text-destructive">{errorMsg || 'Something went wrong'}</p>
              </div>
              <Button className="w-full" variant="outline" onClick={reset}>
                Try Again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
