import { useState, useEffect } from 'react';
import { Book, Globe, MessageSquare, Shield, Zap, Lightbulb, Code2 } from 'lucide-react';
import CodeBlock from '../components/CodeBlock';
import { cn } from '../lib/utils';

export default function Docs() {
    // Dynamically get base URL
    const [baseUrl, setBaseUrl] = useState('');

    useEffect(() => {
        // Get current protocol, domain/IP and port
        const protocol = window.location.protocol; // http: 或 https:
        const host = window.location.host; // 包含域名/IP 和端口
        setBaseUrl(`${protocol}//${host}`);
    }, []);

    return (
        <div className="space-y-8 max-w-4xl mx-auto pb-12">
            <div>
                <h2 className="text-2xl font-semibold text-zinc-900 mb-2 tracking-tight">API Documentation</h2>
                <p className="text-zinc-500">Antigravity API provides OpenAI-compatible endpoints for seamless integration with existing applications.</p>
            </div>

            {/* Base URL */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                <h3 className="font-semibold text-zinc-900 mb-4 flex items-center gap-2 text-base">
                    <Globe className="w-5 h-5 text-zinc-900" />
                    Base URL
                </h3>
                <CodeBlock code={baseUrl || 'Loading...'} />
            </div>

            {/* Endpoints */}
            <div className="space-y-6">
                <EndpointCard
                    method="GET"
                    path="/v1/models"
                    title="Get Model List"
                    desc="Get a list of all available AI models."
                    req={`curl ${baseUrl}/v1/models \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                    res={`{
  "object": "list",
  "data": [
    {
      "id": "gemini-2.0-flash-exp",
      "object": "model",
      "created": 1234567890,
      "owned_by": "google"
    }
  ]
}`}
                />

                <EndpointCard
                    method="POST"
                    path="/v1/chat/completions"
                    title="Chat Completions"
                    desc="Create chat conversation completions, supports streaming and non-streaming responses."
                    req={`curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "stream": true
  }'`}
                    res={`data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk",...}

data: [DONE]`}
                />
            </div>

            {/* Auth Info */}
            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                    <h3 className="font-semibold text-zinc-900 mb-4 flex items-center gap-2 text-base">
                        <Shield className="w-5 h-5 text-zinc-900" />
                        Authentication
                    </h3>
                    <p className="text-zinc-600 text-sm mb-4 leading-relaxed">
                        All API requests require a valid API key in the request header:
                    </p>
                    <CodeBlock code="Authorization: Bearer YOUR_API_KEY" />
                </div>

                <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                    <h3 className="font-semibold text-zinc-900 mb-4 flex items-center gap-2 text-base">
                        <Zap className="w-5 h-5 text-zinc-900" />
                        Rate Limiting
                    </h3>
                    <p className="text-zinc-600 text-sm mb-4 leading-relaxed">
                        When requests exceed rate limits, the API returns status code 429. Response headers contain limit details:
                    </p>
                    <ul className="text-sm text-zinc-500 space-y-2 list-disc list-inside marker:text-zinc-300">
                        <li><code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-700 border border-zinc-200">X-RateLimit-Limit</code>: Max requests</li>
                        <li><code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-700 border border-zinc-200">X-RateLimit-Remaining</code>: Remaining requests</li>
                        <li><code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-700 border border-zinc-200">X-RateLimit-Reset</code>: Seconds until reset</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

function EndpointCard({ method, path, title, desc, req, res }) {
    return (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-zinc-100">
                <div className="flex items-center gap-3 mb-3">
                    <span className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-bold tracking-wide",
                        method === 'GET' ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                    )}>
                        {method}
                    </span>
                    <code className="text-zinc-700 font-mono font-semibold text-sm bg-zinc-50 px-2 py-1 rounded border border-zinc-200/50">{path}</code>
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">{title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{desc}</p>
            </div>

            <div className="bg-zinc-50/50 p-6 space-y-6">
                <div>
                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-300"></div>
                        Request
                    </div>
                    <CodeBlock code={req} />
                </div>
                <div>
                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-300"></div>
                        Response
                    </div>
                    <CodeBlock code={res} />
                </div>
            </div>
        </div>
    );
}
