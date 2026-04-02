import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Clock, Calendar, User, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { OutcomeBadge } from '@/components/ui/outcome-badge';
import { useCall } from '@/hooks/useCalls';
import { formatDuration, maskPhone } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: call, isLoading } = useCall(id!);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-32" />
          </div>
          <div className="lg:col-span-3">
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="flex flex-col items-center py-20">
        <p className="text-dash-t3">Call not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/calls')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Calls
        </Button>
      </div>
    );
  }

  const transcript = call.transcript || [];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/calls')}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Call Log
      </Button>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Left: Call Info */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Call Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-dash-t3" />
                <div>
                  <p className="text-dash-t1">{call.caller_name || 'Unknown caller'}</p>
                  <span className="font-mono text-xs text-dash-t3">{call.caller_number ? maskPhone(call.caller_number) : 'Unknown number'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-dash-t3" />
                <span>{new Date(call.started_at).toLocaleString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-dash-t3" />
                <span>{formatDuration(call.duration_seconds)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-dash-t3" />
                <span>{call.agent?.name || '—'}</span>
              </div>
              <div className="pt-1">
                <OutcomeBadge outcome={call.outcome} />
              </div>
            </CardContent>
          </Card>

          {/* Audio Player placeholder */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-2 flex-1 bg-dash-border rounded-full overflow-hidden">
                  <div className="h-full w-1/3 bg-dash-blue rounded-full" />
                </div>
                <span className="text-xs text-dash-t3 font-mono">1:12 / {formatDuration(call.duration_seconds)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline">Play</Button>
                <div className="flex gap-1">
                  {['1x', '1.5x', '2x'].map((s) => (
                    <Button key={s} size="sm" variant={s === '1x' ? 'secondary' : 'ghost'} className="px-2 h-7 text-xs">
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Extracted Entities */}
          {call.appointment && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Booking Created</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-dash-t3">Name</span>
                  <span>{call.appointment.patient_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dash-t3">Service</span>
                  <span>{call.appointment.service_requested || call.appointment.reason}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dash-t3">Date</span>
                  <span>{new Date(call.appointment.start_time).toLocaleString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {(call.summary || call.transcript_text) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Call Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-dash-t1">
                {call.summary && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-dash-t3">Summary</p>
                    <p>{call.summary}</p>
                  </div>
                )}
                {call.transcript_text && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-dash-t3">Transcript text</p>
                    <p className="whitespace-pre-wrap">{call.transcript_text}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Transcript */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Transcript</CardTitle>
              <Badge variant="outline">{transcript.length} turns</Badge>
            </CardHeader>
            <CardContent>
              {transcript.length === 0 ? (
                <p className="text-sm text-dash-t3 text-center py-12">No transcript available</p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                  {transcript.map((entry, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex gap-3',
                        entry.speaker === 'ai' ? 'flex-row' : 'flex-row-reverse'
                      )}
                    >
                      <div
                        className={cn(
                          'h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-medium mt-0.5',
                          entry.speaker === 'ai'
                            ? 'bg-dash-blue-bg text-dash-blue'
                            : 'bg-dash-surface text-dash-t3'
                        )}
                      >
                        {entry.speaker === 'ai' ? 'AI' : 'C'}
                      </div>
                      <div
                        className={cn(
                          'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                          entry.speaker === 'ai'
                            ? 'bg-dash-blue-bg text-dash-t1'
                            : 'bg-dash-surface text-dash-t1'
                        )}
                      >
                        {entry.text}
                        {entry.timestamp && (
                          <div className="text-xs text-dash-t3 mt-1">
                            {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
