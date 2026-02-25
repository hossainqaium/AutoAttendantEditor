// =============================================================================
// AudioManagerModal — Browse all FusionPBX audio files, upload .wav, record audio
// =============================================================================

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  X, Search, Upload, Mic, Play, Square, Loader2,
  Check, AlertCircle, FolderOpen, Music, ChevronDown, ChevronRight,
  RotateCcw, Trash2, Download,
} from 'lucide-react';
import { getRecordings } from '../api/client';
import { cn } from '../lib/utils';

// ── Built-in FreeSWITCH sound catalog (same as NodeConfigPanel) ───────────────
const BUILTIN_SOUNDS: Array<{ category: string; files: Array<{ path: string; label: string }> }> = [
  {
    category: 'IVR Prompts',
    files: [
      { path: 'ivr/ivr-welcome.wav',                                  label: 'Welcome' },
      { path: 'ivr/ivr-thank_you_for_calling.wav',                    label: 'Thank you for calling' },
      { path: 'ivr/ivr-thank_you.wav',                                label: 'Thank you' },
      { path: 'ivr/ivr-thank_you_for_using_this_service.wav',         label: 'Thank you for using this service' },
      { path: 'ivr/ivr-greeting.wav',                                 label: 'Greeting' },
      { path: 'ivr/ivr-goodbye.wav',                                  label: 'Goodbye' },
      { path: 'ivr/ivr-one_moment_please.wav',                        label: 'One moment please' },
      { path: 'ivr/ivr-please_hold.wav',                              label: 'Please hold' },
      { path: 'ivr/ivr-please_stay_on_the_line.wav',                  label: 'Please stay on the line' },
      { path: 'ivr/ivr-please_try_again.wav',                         label: 'Please try again' },
      { path: 'ivr/ivr-please_enter_extension_followed_by_pound.wav', label: 'Please enter extension followed by pound' },
      { path: 'ivr/ivr-please_enter_the_phone_number.wav',            label: 'Please enter the phone number' },
      { path: 'ivr/ivr-please_choose_from_the_following.wav',         label: 'Please choose from the following' },
      { path: 'ivr/ivr-to_repeat_these_options.wav',                  label: 'To repeat these options' },
      { path: 'ivr/ivr-hold_connect_call.wav',                        label: 'Please hold while we connect your call' },
      { path: 'ivr/ivr-not_available.wav',                            label: 'Not available' },
      { path: 'ivr/ivr-no_match_trying_again.wav',                    label: 'No match, trying again' },
      { path: 'ivr/ivr-did_not_receive_response.wav',                 label: 'Did not receive a response' },
      { path: 'ivr/ivr-sorry_i_didnt_catch_that.wav',                 label: "Sorry, I didn't catch that" },
      { path: 'ivr/ivr-invalid_extension.wav',                        label: 'Invalid extension' },
      { path: 'ivr/ivr-invalid_number.wav',                           label: 'Invalid number' },
      { path: 'ivr/ivr-your_call_is_being_placed.wav',                label: 'Your call is being placed' },
      { path: 'ivr/ivr-this_call_may_be_recorded.wav',                label: 'This call may be recorded' },
      { path: 'ivr/ivr-error.wav',                                    label: 'Error' },
      { path: 'ivr/ivr-record_message.wav',                           label: 'Record message' },
      { path: 'ivr/ivr-at_the_tone_please_record.wav',                label: 'At the tone please record' },
      { path: 'ivr/ivr-welcome_to_the_voicemail_system.wav',          label: 'Welcome to the voicemail system' },
      { path: 'ivr/ivr-access_code.wav',                              label: 'Access code' },
      { path: 'ivr/ivr-dial_by_name.wav',                             label: 'Dial by name' },
    ],
  },
  {
    category: 'Voicemail',
    files: [
      { path: 'voicemail/vm-hello.wav',                label: 'Hello' },
      { path: 'voicemail/vm-not_available.wav',        label: 'Not available' },
      { path: 'voicemail/vm-dear_caller.wav',          label: 'Dear caller' },
      { path: 'voicemail/vm-enter_id.wav',             label: 'Enter ID' },
      { path: 'voicemail/vm-enter_pass.wav',           label: 'Enter password' },
      { path: 'voicemail/vm-new.wav',                  label: 'New' },
      { path: 'voicemail/vm-message.wav',              label: 'Message' },
      { path: 'voicemail/vm-messages.wav',             label: 'Messages' },
      { path: 'voicemail/vm-empty.wav',                label: 'Empty / no messages' },
      { path: 'voicemail/vm-you_have.wav',             label: 'You have' },
      { path: 'voicemail/vm-saved.wav',                label: 'Saved' },
      { path: 'voicemail/vm-deleted.wav',              label: 'Deleted' },
      { path: 'voicemail/vm-record_greeting.wav',      label: 'Record greeting' },
      { path: 'voicemail/vm-access_denied.wav',        label: 'Access denied' },
    ],
  },
  {
    category: 'Digits & Numbers',
    files: [
      { path: 'digits/0.wav', label: 'Zero (0)' },
      { path: 'digits/1.wav', label: 'One (1)' },
      { path: 'digits/2.wav', label: 'Two (2)' },
      { path: 'digits/3.wav', label: 'Three (3)' },
      { path: 'digits/4.wav', label: 'Four (4)' },
      { path: 'digits/5.wav', label: 'Five (5)' },
      { path: 'digits/6.wav', label: 'Six (6)' },
      { path: 'digits/7.wav', label: 'Seven (7)' },
      { path: 'digits/8.wav', label: 'Eight (8)' },
      { path: 'digits/9.wav', label: 'Nine (9)' },
      { path: 'digits/star.wav',  label: 'Star (*)' },
      { path: 'digits/pound.wav', label: 'Pound (#)' },
    ],
  },
  {
    category: 'Conference',
    files: [
      { path: 'conference/conf-enter_conf_pin.wav',        label: 'Enter conference PIN' },
      { path: 'conference/conf-has_joined.wav',            label: 'Has joined' },
      { path: 'conference/conf-has_left.wav',              label: 'Has left' },
      { path: 'conference/conf-locked.wav',                label: 'Locked' },
      { path: 'conference/conf-muted.wav',                 label: 'Muted' },
      { path: 'conference/conf-unmuted.wav',               label: 'Unmuted' },
      { path: 'conference/conf-recording_started.wav',     label: 'Recording started' },
      { path: 'conference/conf-recording_stopped.wav',     label: 'Recording stopped' },
      { path: 'conference/conf-you_are_muted.wav',         label: 'You are muted' },
    ],
  },
  {
    category: 'Music on Hold',
    files: [
      { path: 'music/8000/suite-espanola.wav',        label: 'Suite Española' },
      { path: 'music/8000/danza-espanola-op37.wav',   label: 'Danza Española Op.37' },
      { path: 'music/8000/partita-no-3.wav',          label: 'Partita No. 3' },
      { path: 'music/8000/dont-you-wish.wav',         label: "Don't You Wish" },
    ],
  },
  {
    category: 'Miscellaneous',
    files: [
      { path: 'misc/transfer.wav',   label: 'Transfer' },
      { path: 'misc/hold_music.wav', label: 'Hold music' },
      { path: 'misc/error.wav',      label: 'Error tone' },
      { path: 'misc/ring.wav',       label: 'Ring' },
    ],
  },
];

// ── WAV encoder ───────────────────────────────────────────────────────────────
function encodeWAV(audioBuffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate  = audioBuffer.sampleRate;

  // Mix down to mono
  let mono: Float32Array;
  if (audioBuffer.numberOfChannels === 1) {
    mono = audioBuffer.getChannelData(0);
  } else {
    mono = new Float32Array(audioBuffer.length);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const ch_data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < audioBuffer.length; i++) mono[i] += ch_data[i];
    }
    for (let i = 0; i < mono.length; i++) mono[i] /= audioBuffer.numberOfChannels;
  }

  const len    = mono.length;
  const buffer = new ArrayBuffer(44 + len * 2);
  const view   = new DataView(buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4,  36 + len * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, len * 2, true);

  let offset = 44;
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// ── Prop types ────────────────────────────────────────────────────────────────
interface Props {
  domainUuid: string;
  onClose: () => void;
}

type TabId = 'browse' | 'upload' | 'record';

// ── Browse tab ────────────────────────────────────────────────────────────────
function BrowseTab({ domainUuid }: { domainUuid: string }) {
  const [query, setQuery] = useState('');
  const [customFiles, setCustomFiles] = useState<Array<{ path: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState('');
  const [playingPath, setPlayingPath] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  useEffect(() => {
    if (!domainUuid) return;
    setLoading(true);
    getRecordings(domainUuid)
      .then((rows) => setCustomFiles(
        rows.map((r: { recording_filename: string; recording_name: string }) => ({
          path:  r.recording_filename,
          label: r.recording_name || r.recording_filename,
        }))
      ))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [domainUuid]);

  const allCategories = useMemo(() => {
    const base = customFiles.length > 0
      ? [{ category: 'Custom Recordings', files: customFiles }, ...BUILTIN_SOUNDS]
      : BUILTIN_SOUNDS;
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base
      .map((cat) => ({
        ...cat,
        files: cat.files.filter((f) =>
          f.label.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.files.length > 0);
  }, [query, customFiles]);

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
    setCopied(path);
    setTimeout(() => setCopied(''), 1500);
  };

  const togglePlay = (filePath: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingPath === filePath) {
      setPlayingPath('');
      return;
    }
    const url = `/api/assets/sounds/stream?path=${encodeURIComponent(filePath)}`
      + (domainUuid ? `&domainUuid=${encodeURIComponent(domainUuid)}` : '');
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => setPlayingPath(''));
    audio.onended = () => setPlayingPath('');
    audio.onerror = () => setPlayingPath('');
    setPlayingPath(filePath);
  };

  const toggle = (cat: string) =>
    setCollapsed((p) => ({ ...p, [cat]: !p[cat] }));

  const totalCount = allCategories.reduce((s, c) => s + c.files.length, 0);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search audio files…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={13}/>
          </button>
        )}
      </div>

      <div className="text-[11px] text-gray-400">
        {loading ? 'Loading custom recordings…' : `${totalCount} file${totalCount !== 1 ? 's' : ''}`}
      </div>

      {/* File list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {allCategories.map((cat) => (
          <div key={cat.category} className="border border-gray-100 rounded-lg overflow-hidden">
            <button
              onClick={() => toggle(cat.category)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FolderOpen size={13} className="text-indigo-400" />
                <span className="text-xs font-semibold text-gray-700">{cat.category}</span>
                <span className="text-[10px] text-gray-400">({cat.files.length})</span>
              </div>
              {collapsed[cat.category]
                ? <ChevronRight size={12} className="text-gray-400"/>
                : <ChevronDown  size={12} className="text-gray-400"/>
              }
            </button>

            {!collapsed[cat.category] && (
              <div className="divide-y divide-gray-50">
                {cat.files.map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 group transition-colors"
                  >
                    <Music size={11} className="text-gray-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-gray-700 truncate">{f.label}</p>
                      <p className="text-[9px] text-gray-400 font-mono truncate">{f.path}</p>
                    </div>
                    <button
                      onClick={() => togglePlay(f.path)}
                      title={playingPath === f.path ? 'Stop' : 'Play'}
                      className={cn(
                        'px-1.5 py-0.5 rounded border transition-all shrink-0',
                        playingPath === f.path
                          ? 'opacity-100 border-red-300 bg-red-50 text-red-500 hover:bg-red-100'
                          : 'opacity-0 group-hover:opacity-100 border-gray-200 text-gray-500 hover:bg-indigo-100 hover:border-indigo-300 hover:text-indigo-600',
                      )}
                    >
                      {playingPath === f.path
                        ? <Square size={10} className="fill-current"/>
                        : <Play   size={10} className="fill-current"/>
                      }
                    </button>
                    <button
                      onClick={() => copyPath(f.path)}
                      title="Copy path"
                      className="opacity-0 group-hover:opacity-100 px-2 py-0.5 text-[9px] rounded border border-gray-200 hover:bg-indigo-100 hover:border-indigo-300 text-gray-500 hover:text-indigo-600 transition-all shrink-0"
                    >
                      {copied === f.path ? <Check size={10} className="text-green-500"/> : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {allCategories.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">No audio files found.</div>
        )}
      </div>
    </div>
  );
}

// ── Upload tab ────────────────────────────────────────────────────────────────
function UploadTab({ domainUuid, onUploaded }: { domainUuid: string; onUploaded: () => void }) {
  const [file, setFile]       = useState<File | null>(null);
  const [name, setName]       = useState('');
  const [status, setStatus]   = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg]   = useState('');
  const [drag, setDrag]       = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setName(f.name.replace(/\.[^.]+$/, ''));
    setStatus('idle');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const upload = async () => {
    if (!file || !domainUuid) return;
    setStatus('uploading');
    setErrMsg('');
    try {
      const fd = new FormData();
      fd.append('domainUuid', domainUuid);
      fd.append('recordingName', name || file.name);
      fd.append('file', file, name ? `${name}.wav` : file.name);

      const res = await fetch('/api/assets/recordings/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setStatus('done');
      setFile(null);
      setName('');
      onUploaded();
    } catch (e) {
      setErrMsg(String(e instanceof Error ? e.message : e));
      setStatus('error');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        className={cn(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
          drag ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50',
          file && 'border-emerald-400 bg-emerald-50',
        )}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".wav,.mp3,.ogg,.flac"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {file ? (
          <div className="flex flex-col items-center gap-1">
            <Check size={24} className="text-emerald-500"/>
            <p className="text-sm font-medium text-emerald-700">{file.name}</p>
            <p className="text-[11px] text-emerald-500">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <Upload size={28}/>
            <p className="text-sm font-medium text-gray-600">Drop audio file here or click to browse</p>
            <p className="text-[11px]">.wav · .mp3 · .ogg · .flac</p>
          </div>
        )}
      </div>

      {/* Name input */}
      {file && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Recording name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. welcome_message"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      )}

      {/* Status */}
      {status === 'error' && (
        <div className="flex gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5"/>
          <span className="whitespace-pre-line">{errMsg}</span>
        </div>
      )}
      {status === 'done' && (
        <div className="flex items-center gap-2 text-emerald-600 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <Check size={13}/> File uploaded successfully!
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={upload}
        disabled={!file || status === 'uploading'}
        className={cn(
          'flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors',
          file && status !== 'uploading'
            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed',
        )}
      >
        {status === 'uploading'
          ? <><Loader2 size={14} className="animate-spin"/> Uploading…</>
          : <><Upload size={14}/> Upload to FusionPBX</>
        }
      </button>
    </div>
  );
}

// ── Record tab ────────────────────────────────────────────────────────────────
type RecordState = 'idle' | 'requesting' | 'recording' | 'recorded' | 'uploading' | 'done' | 'error';

function RecordTab({ domainUuid, onUploaded }: { domainUuid: string; onUploaded: () => void }) {
  const [recState, setRecState]     = useState<RecordState>('idle');
  const [errMsg, setErrMsg]         = useState('');
  const [elapsed, setElapsed]       = useState(0);
  const [wavBlob, setWavBlob]       = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl]     = useState('');
  const [name, setName]             = useState('');
  const mediaRef   = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<BlobPart[]>([]);
  const timerRef   = useRef<number | null>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = async () => {
    setRecState('requesting');
    setErrMsg('');
    setWavBlob(null);
    setAudioUrl('');
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const rawBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        try {
          // Decode and re-encode as WAV
          const arrayBuf = await rawBlob.arrayBuffer();
          const audioCtx = new AudioContext();
          const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
          audioCtx.close();
          const wav = encodeWAV(audioBuf);
          setWavBlob(wav);
          setAudioUrl(URL.createObjectURL(wav));
        } catch {
          // Fallback: use raw blob if WAV conversion fails
          setWavBlob(rawBlob);
          setAudioUrl(URL.createObjectURL(rawBlob));
        }
        setRecState('recorded');
      };

      recorder.start(100);
      setRecState('recording');
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Microphone access denied');
      setRecState('error');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
  };

  const reset = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setWavBlob(null);
    setAudioUrl('');
    setName('');
    setElapsed(0);
    setErrMsg('');
    setRecState('idle');
  };

  const upload = async () => {
    if (!wavBlob || !domainUuid) return;
    setRecState('uploading');
    try {
      const filename = (name.trim() || `recording_${Date.now()}`).replace(/\s+/g, '_') + '.wav';
      const fd = new FormData();
      fd.append('domainUuid', domainUuid);
      fd.append('recordingName', name.trim() || filename);
      fd.append('file', new File([wavBlob], filename, { type: 'audio/wav' }), filename);

      const res = await fetch('/api/assets/recordings/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setRecState('done');
      onUploaded();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Upload failed');
      setRecState('error');
    }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="flex flex-col gap-4 items-center">
      {/* Visualiser / status circle */}
      <div className={cn(
        'w-28 h-28 rounded-full flex flex-col items-center justify-center border-4 transition-all duration-300',
        recState === 'recording'
          ? 'border-red-400 bg-red-50 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse'
          : recState === 'recorded'
          ? 'border-emerald-400 bg-emerald-50'
          : 'border-gray-200 bg-gray-50',
      )}>
        {recState === 'idle' && <Mic size={36} className="text-gray-300"/>}
        {recState === 'requesting' && <Loader2 size={30} className="text-indigo-400 animate-spin"/>}
        {recState === 'recording' && (
          <>
            <Square size={24} className="text-red-500 mb-1"/>
            <span className="text-sm font-mono font-bold text-red-600">{fmt(elapsed)}</span>
          </>
        )}
        {(recState === 'recorded' || recState === 'uploading' || recState === 'done') && (
          <Check size={36} className="text-emerald-500"/>
        )}
        {recState === 'error' && <AlertCircle size={36} className="text-red-400"/>}
      </div>

      {/* State label */}
      <p className="text-sm text-gray-500">
        {recState === 'idle'      && 'Click Record to start'}
        {recState === 'requesting' && 'Requesting microphone…'}
        {recState === 'recording' && <span className="text-red-500 font-medium">Recording… {fmt(elapsed)}</span>}
        {recState === 'recorded'  && 'Recording complete — listen or upload below'}
        {recState === 'uploading' && 'Uploading to FusionPBX…'}
        {recState === 'done'      && <span className="text-emerald-600 font-medium">Uploaded successfully!</span>}
        {recState === 'error'     && <span className="text-red-500 whitespace-pre-line">{errMsg}</span>}
      </p>

      {/* Controls */}
      {(recState === 'idle' || recState === 'error') && (
        <button
          onClick={startRecording}
          className="flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold transition-colors shadow"
        >
          <Mic size={15}/> Record
        </button>
      )}

      {recState === 'recording' && (
        <button
          onClick={stopRecording}
          className="flex items-center gap-2 px-6 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <Square size={15}/> Stop
        </button>
      )}

      {(recState === 'recorded' || recState === 'uploading') && (
        <div className="w-full flex flex-col gap-3">
          {/* Audio player */}
          {audioUrl && (
            <audio controls src={audioUrl} className="w-full h-8 rounded"/>
          )}

          {/* Name input */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Recording name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`recording_${Date.now()}`}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              disabled={recState === 'uploading'}
            >
              <RotateCcw size={13}/> Re-record
            </button>
            <button
              onClick={upload}
              disabled={recState === 'uploading'}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors',
                recState !== 'uploading'
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed',
              )}
            >
              {recState === 'uploading'
                ? <><Loader2 size={14} className="animate-spin"/> Uploading…</>
                : <><Upload size={14}/> Upload to FusionPBX</>
              }
            </button>
          </div>
        </div>
      )}

      {recState === 'done' && (
        <button
          onClick={reset}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <Mic size={14}/> Record Another
        </button>
      )}

      {/* Download hint */}
      {audioUrl && recState === 'recorded' && (
        <a
          href={audioUrl}
          download={`${(name.trim() || 'recording').replace(/\s+/g,'_')}.wav`}
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-indigo-500 transition-colors"
        >
          <Download size={11}/> Save WAV locally
        </a>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function AudioManagerModal({ domainUuid, onClose }: Props) {
  const [tab, setTab]             = useState<TabId>('browse');
  const [refreshKey, setRefreshKey] = useState(0);

  const onUploaded = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setTab('browse');
  }, []);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'browse', label: 'Browse All',    icon: <Search size={13}/> },
    { id: 'upload', label: 'Upload .wav',   icon: <Upload size={13}/> },
    { id: 'record', label: 'Record Audio',  icon: <Mic    size={13}/> },
  ];

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden"
           style={{ maxHeight: '88vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Music size={16} className="text-indigo-600"/>
            </div>
            <h2 className="text-base font-semibold text-gray-800">Audio Files Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100"
          >
            <X size={18}/>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 shrink-0 px-4 pt-2 gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors',
                tab === t.id
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50',
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content — flex-col + min-h-0 lets the inner scroll containers work */}
        <div className="flex-1 min-h-0 overflow-hidden p-5 flex flex-col">
          {tab === 'browse' && <BrowseTab key={refreshKey} domainUuid={domainUuid}/>}
          {tab === 'upload' && <UploadTab domainUuid={domainUuid} onUploaded={onUploaded}/>}
          {tab === 'record' && <RecordTab domainUuid={domainUuid} onUploaded={onUploaded}/>}
        </div>
      </div>
    </div>
  );
}
