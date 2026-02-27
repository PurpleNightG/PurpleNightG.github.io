import { useState, useEffect, useRef, useCallback } from 'react'
import Peer, { MediaConnection } from 'peerjs'
import { Monitor, Users, Copy, Check, StopCircle, Play, Link2, X, Maximize2, Minimize2 } from 'lucide-react'

type Mode = 'select' | 'host' | 'viewer'
type Status = 'idle' | 'connecting' | 'streaming' | 'watching' | 'error'

const PEER_PREFIX = 'ziye-share-'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.qq.com:3478' },
  { urls: 'stun:stun.miwifi.com:3478' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
]

async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${API_URL}/turn/credentials`, { method: 'POST' })
    const data = await res.json()
    if (data.success && data.iceServers) {
      return data.iceServers
    }
  } catch (e) {
    console.warn('TURN credentials fetch failed, using fallback STUN:', e)
  }
  return FALLBACK_ICE_SERVERS
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function getCurrentUsername(): string {
  try {
    const adminUser = localStorage.getItem('user') || sessionStorage.getItem('user')
    if (adminUser) {
      const parsed = JSON.parse(adminUser)
      return parsed.username || parsed.name || '未知用户'
    }
    const studentUser = localStorage.getItem('studentUser') || sessionStorage.getItem('studentUser')
    if (studentUser) {
      const parsed = JSON.parse(studentUser)
      return parsed.username || parsed.name || parsed.game_id || '未知用户'
    }
  } catch {}
  return '未知用户'
}

export default function ScreenShare() {
  const [mode, setMode] = useState<Mode>('select')
  const [status, setStatus] = useState<Status>('idle')
  const [roomCode, setRoomCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [viewerCount, setViewerCount] = useState(0)
  const [viewerNames, setViewerNames] = useState<string[]>([])
  const [hostName, setHostName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [connectionInfo, setConnectionInfo] = useState<string>('')
  const [connectStep, setConnectStep] = useState('')
  const [connMode, setConnMode] = useState<'auto' | 'relay' | 'stun'>('auto')
  const myName = useRef(getCurrentUsername())

  const peerRef = useRef<Peer | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const connectionsRef = useRef<MediaConnection[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<Status>('idle')
  const connectStepRef = useRef('')

  // Keep statusRef in sync
  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    connectStepRef.current = connectStep
  }, [connectStep])

  // Bind stream to video element after React renders the <video>
  useEffect(() => {
    if ((status === 'streaming' || status === 'watching') && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      if (status === 'streaming') {
        videoRef.current.muted = true
      }
      videoRef.current.play().catch(() => {})
    }
  }, [status])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const cleanup = useCallback(() => {
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    // Close all connections
    connectionsRef.current.forEach(conn => conn.close())
    connectionsRef.current = []
    // Destroy peer
    if (peerRef.current) {
      peerRef.current.destroy()
      peerRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setViewerCount(0)
    setViewerNames([])
  }, [])

  const handleStartHost = async () => {
    setMode('host')
    setStatus('connecting')
    setErrorMsg('')
    setConnectStep('获取连接配置...')

    try {
      const iceServers = await fetchIceServers()

      // Capture screen first
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          cursor: 'always',
          frameRate: { ideal: 30, max: 60 }
        } as any,
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      })
      streamRef.current = stream

      // When user stops sharing via browser UI
      stream.getVideoTracks()[0].onended = () => {
        handleStop()
      }

      // Create peer with room code
      const code = generateRoomCode()
      setRoomCode(code)
      const peerId = PEER_PREFIX + code

      const peer = new Peer(peerId, {
        debug: 0,
        config: { iceServers }
      })

      peer.on('open', () => {
        setStatus('streaming')
        // Show local preview
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.muted = true
          videoRef.current.play().catch(() => {})
        }
      })

      // When a viewer connects via data connection, call them back with the stream
      peer.on('connection', (dataConn) => {
        let viewerName = ''
        dataConn.on('open', () => {
          // Send host name to viewer
          dataConn.send({ type: 'host-info', name: myName.current })
        })
        dataConn.on('data', (data: any) => {
          if (data?.type === 'viewer-info' && data.name) {
            viewerName = data.name
            setViewerNames(prev => [...prev, viewerName])
          }
        })
        dataConn.on('open', () => {
          const viewerPeerId = dataConn.peer
          // Host calls the viewer with the screen stream
          const call = peer.call(viewerPeerId, stream)
          connectionsRef.current.push(call)

          let removed = false
          const removeViewer = () => {
            if (removed) return
            removed = true
            connectionsRef.current = connectionsRef.current.filter(c => c !== call)
            setViewerCount(prev => Math.max(0, prev - 1))
            if (viewerName) setViewerNames(prev => { const i = prev.indexOf(viewerName); return i >= 0 ? [...prev.slice(0, i), ...prev.slice(i + 1)] : prev })
          }
          
          // Capture ICE connection info (use addEventListener to avoid overwriting PeerJS handlers)
          const pc = (call as any).peerConnection as RTCPeerConnection | undefined
          if (pc) {
            pc.addEventListener('connectionstatechange', () => {
              if (pc.connectionState === 'connected') {
                pc.getStats().then((stats) => {
                  let localCandidateId = ''
                  stats.forEach((report: any) => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                      localCandidateId = report.localCandidateId
                    }
                  })
                  if (localCandidateId) {
                    stats.forEach((r: any) => {
                      if (r.id === localCandidateId && r.candidateType) {
                        const type = r.candidateType === 'host' ? '局域网直连' : r.candidateType === 'prflx' ? 'P2P直连' : r.candidateType === 'srflx' ? 'STUN穿透' : r.candidateType === 'relay' ? 'TURN中继' : r.candidateType
                        setConnectionInfo(`${type} · ${r.protocol.toUpperCase()}`)
                      }
                    })
                  }
                })
              }
              if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                removeViewer()
              }
            })
          }
          setViewerCount(prev => prev + 1)

          call.on('close', removeViewer)
          call.on('error', removeViewer)
          // dataConn close fires reliably when browser is closed abruptly
          dataConn.on('close', removeViewer)
        })
      })

      peer.on('error', (err) => {
        console.error('Peer error:', err)
        if (err.type === 'unavailable-id') {
          setErrorMsg('房间代码冲突，请重试')
        } else {
          setErrorMsg(`连接错误: ${err.message}`)
        }
        setStatus('error')
      })

      peerRef.current = peer
    } catch (err: any) {
      console.error('Screen capture error:', err)
      if (err.name === 'NotAllowedError') {
        setErrorMsg('您取消了屏幕共享')
      } else {
        setErrorMsg(`无法捕获屏幕: ${err.message}`)
      }
      setStatus('error')
      setMode('select')
    }
  }

  const handleJoinRoom = async () => {
    const code = inputCode.trim().toUpperCase()
    if (code.length !== 6) {
      setErrorMsg('请输入6位房间代码')
      return
    }

    setMode('viewer')
    setStatus('connecting')
    setErrorMsg('')
    setConnectStep('获取连接配置...')

    const allIceServers = await fetchIceServers()
    const iceServers = connMode === 'stun'
      ? allIceServers.filter((s: any) => {
          const urls = Array.isArray(s.urls) ? s.urls : [s.urls]
          return urls.every((u: string) => u.startsWith('stun:'))
        })
      : allIceServers
    setConnectStep('连接信令服务器...')

    const peer = new Peer({
      debug: 0,
      config: {
        iceServers,
        iceTransportPolicy: connMode === 'relay' ? 'relay' : 'all',
      }
    })

    peer.on('open', () => {
      setConnectStep('连接到主播...')
      const hostPeerId = PEER_PREFIX + code
      // Connect to host via data connection to announce ourselves
      const dataConn = peer.connect(hostPeerId)

      dataConn.on('open', () => {
        setConnectStep('等待主播回传视频流...')
        // Send viewer name to host
        dataConn.send({ type: 'viewer-info', name: myName.current })
      })

      dataConn.on('data', (data: any) => {
        if (data?.type === 'host-info' && data.name) {
          setHostName(data.name)
        }
      })

      dataConn.on('error', (err) => {
        console.error('Data connection error:', err)
        setErrorMsg('无法连接到房间（数据通道失败）')
        setStatus('error')
      })

      // Timeout for connection
      setTimeout(() => {
        if (statusRef.current === 'connecting') {
          setErrorMsg(`连接超时，卡在：${connectStepRef.current}`)
          setStatus('error')
        }
      }, 15000)
    })

    // Host will call us back with the screen stream
    peer.on('call', (call) => {
      call.answer()
      
      // Capture ICE connection info (use addEventListener to avoid overwriting PeerJS handlers)
      const pc = (call as any).peerConnection as RTCPeerConnection | undefined
      if (pc) {
        pc.addEventListener('connectionstatechange', () => {
          if (pc.connectionState === 'connected') {
            pc.getStats().then((stats) => {
              let remoteCandidateId = ''
              stats.forEach((report: any) => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                  remoteCandidateId = report.remoteCandidateId
                }
              })
              if (remoteCandidateId) {
                stats.forEach((r: any) => {
                  if (r.id === remoteCandidateId && r.candidateType) {
                    const type = r.candidateType === 'host' ? '局域网直连' : r.candidateType === 'prflx' ? 'P2P直连' : r.candidateType === 'srflx' ? 'STUN穿透' : r.candidateType === 'relay' ? 'TURN中继' : r.candidateType
                    setConnectionInfo(`${type} · ${r.protocol.toUpperCase()}`)
                  }
                })
              }
            })
          }
        })
      }

      call.on('stream', (remoteStream) => {
        setStatus('watching')
        streamRef.current = remoteStream
        if (videoRef.current) {
          videoRef.current.srcObject = remoteStream
          videoRef.current.play().catch(() => {})
        }
      })

      call.on('close', () => {
        setErrorMsg('主播已停止共享')
        setStatus('error')
      })

      call.on('error', (err) => {
        console.error('Call error:', err)
        setErrorMsg('连接失败')
        setStatus('error')
      })

      connectionsRef.current.push(call)
    })

    peer.on('error', (err) => {
      console.error('Peer error:', err)
      if (err.type === 'peer-unavailable') {
        setErrorMsg('房间不存在或已关闭')
      } else {
        setErrorMsg(`连接错误: ${err.message}`)
      }
      setStatus('error')
    })

    peerRef.current = peer
  }

  const handleStop = () => {
    cleanup()
    setStatus('idle')
    setMode('select')
    setRoomCode('')
    setInputCode('')
    setErrorMsg('')
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textArea = document.createElement('textarea')
      textArea.value = roomCode
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current.requestFullscreen()
    }
  }

  // Mode selection screen
  if (mode === 'select') {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-6">
        <div className="max-w-3xl w-full">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-800 mb-6 shadow-lg shadow-purple-500/20">
              <Monitor size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-3">屏幕共享</h1>
            <p className="text-gray-400 text-lg">无需安装任何软件，浏览器直连，点对点传输</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Host card */}
            <button
              onClick={handleStartHost}
              className="group relative bg-gray-800/40 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8 text-left hover:border-purple-500/50 hover:bg-gray-800/60 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative">
                <div className="w-14 h-14 rounded-xl bg-purple-600/20 flex items-center justify-center mb-5 group-hover:bg-purple-600/30 transition-colors">
                  <Play size={28} className="text-purple-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">分享我的屏幕</h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                  选择要共享的窗口或屏幕，生成房间代码，将代码分享给观看者即可
                </p>
              </div>
            </button>

            {/* Viewer card */}
            <div className="relative bg-gray-800/40 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8 hover:border-purple-500/50 hover:bg-gray-800/60 transition-all duration-300">
              <div className="w-14 h-14 rounded-xl bg-blue-600/20 flex items-center justify-center mb-5">
                <Link2 size={28} className="text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">观看屏幕</h2>
              <p className="text-gray-400 text-sm mb-5">输入分享者提供的6位房间代码</p>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  placeholder="输入房间代码"
                  maxLength={6}
                  className="flex-[3] min-w-0 bg-gray-900/60 border border-gray-600/50 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 font-mono text-lg tracking-widest text-center uppercase"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={inputCode.length !== 6}
                  className="flex-[1] bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
                >
                  加入
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs shrink-0">连接方式</span>
                <div className="flex gap-1.5 flex-1">
                  {(['auto', 'relay', 'stun'] as const).map((m) => {
                    const labels = { auto: '自动', relay: 'TURN中继', stun: '仅STUN' }
                    const hints = { auto: '优先直连，自动回退', relay: '强制中继，穿透性最强', stun: '纯P2P，不走中继' }
                    return (
                      <button
                        key={m}
                        onClick={() => setConnMode(m)}
                        title={hints[m]}
                        className={`flex-1 py-1 rounded-md text-xs font-medium transition-colors border ${
                          connMode === m
                            ? 'bg-purple-600/30 border-purple-500/60 text-purple-300'
                            : 'bg-gray-900/40 border-gray-700/40 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                        }`}
                      >
                        {labels[m]}
                      </button>
                    )
                  })}
                </div>
              </div>
              {errorMsg && mode === 'select' && (
                <p className="text-red-400 text-sm mt-3">{errorMsg}</p>
              )}
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-gray-500 text-sm">
              使用 WebRTC 技术，数据直接在浏览器间传输，不经过任何服务器
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Streaming / Watching screen
  return (
    <div className={`flex flex-col ${isFullscreen ? 'h-screen bg-black' : 'min-h-[calc(100vh-8rem)] px-6 py-4 max-w-[1600px] mx-auto w-full'}`} ref={containerRef}>
      {/* Top bar */}
      <div className={`flex items-center justify-between flex-wrap gap-3 ${isFullscreen ? 'absolute top-0 left-0 right-0 z-10 p-3 bg-gradient-to-b from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300' : 'mb-4'}`}>
        <div className="flex items-center gap-4 flex-wrap">
          {mode === 'host' && status === 'streaming' && (
            <>
              <div className="flex items-center gap-2 bg-red-600/20 border border-red-500/30 rounded-lg px-3 py-1.5">
                <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-red-400 text-sm font-medium">正在共享</span>
              </div>
              <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-lg px-4 py-1.5">
                <span className="text-gray-400 text-sm">房间代码:</span>
                <span className="text-white font-mono text-lg tracking-widest font-bold">{roomCode}</span>
                <button onClick={handleCopy} className="ml-1 text-gray-400 hover:text-white transition-colors">
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              </div>
              <div className="relative group flex items-center gap-1.5 text-gray-400 text-sm cursor-default">
                <Users size={16} />
                <span>{viewerCount} 人观看</span>
                {viewerNames.length > 0 && (
                  <div className="absolute top-full left-0 mt-2 hidden group-hover:block z-20">
                    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-2 px-1 min-w-[140px]">
                      <p className="text-gray-500 text-xs px-3 pb-1.5 border-b border-gray-700 mb-1">观看成员</p>
                      {viewerNames.map((name, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                          <span className="text-gray-300 text-sm whitespace-nowrap">{name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          {mode === 'viewer' && status === 'watching' && (
            <>
              <div className="flex items-center gap-2 bg-green-600/20 border border-green-500/30 rounded-lg px-3 py-1.5">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400 text-sm font-medium">正在观看</span>
              </div>
              {hostName && (
                <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5">
                  <span className="text-gray-400 text-sm">分享者:</span>
                  <span className="text-white text-sm font-medium">{hostName}</span>
                </div>
              )}
              {connectionInfo && (
                <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5">
                  <span className="text-gray-500 text-xs">连接:</span>
                  <span className="text-gray-300 text-xs font-mono">{connectionInfo}</span>
                </div>
              )}
            </>
          )}
          {status === 'connecting' && (
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-gray-400">{connectStep || '正在连接...'}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(status === 'streaming' || status === 'watching') && (
            <button
              onClick={toggleFullscreen}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          )}
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg transition-colors"
          >
            {mode === 'host' ? <StopCircle size={18} /> : <X size={18} />}
            <span className="text-sm font-medium">{mode === 'host' ? '停止共享' : '断开连接'}</span>
          </button>
        </div>
      </div>

      {/* Video area */}
      <div className={`flex-1 overflow-hidden flex items-center justify-center relative ${isFullscreen ? 'w-full h-full' : 'bg-gray-900/80 rounded-2xl border border-gray-700/50 min-h-[60vh]'}`}>
        {status === 'error' ? (
          <div className="text-center p-8">
            <div className="w-16 h-16 rounded-full bg-red-600/20 flex items-center justify-center mx-auto mb-4">
              <X size={32} className="text-red-400" />
            </div>
            <p className="text-red-400 text-lg mb-2">{errorMsg}</p>
            <button
              onClick={handleStop}
              className="mt-4 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
            >
              返回
            </button>
          </div>
        ) : status === 'connecting' ? (
          <div className="text-center p-8">
            <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400 text-lg">
              {mode === 'host' ? '准备共享屏幕...' : '正在连接到房间...'}
            </p>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-contain"
            style={isFullscreen ? { width: '100vw', height: '100vh' } : { maxHeight: 'calc(100vh - 12rem)' }}
          />
        )}
      </div>
    </div>
  )
}
