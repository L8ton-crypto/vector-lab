"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database, Search, Plus, Trash2, Upload, Loader2, Zap,
  ChevronRight, BarChart3, Eye, X, Box, Menu
} from "lucide-react";
import { chunkText, generateEmbedding, generateEmbeddings } from "@/lib/embeddings";
import { projectTo2D } from "@/lib/pca";

interface Collection {
  id: string;
  name: string;
  description: string;
  chunk_size: number;
  chunk_overlap: number;
  doc_count: number;
  created_at: string;
}

interface Doc {
  id: string;
  content: string;
  chunk_index: number;
  has_embedding: boolean;
}

interface SearchResult {
  id: string;
  content: string;
  chunk_index: number;
  similarity: number;
}

interface VectorPoint {
  id: string;
  content: string;
  chunkIndex: number;
  embedding: number[];
}

type Tab = "documents" | "search" | "visualise";

export default function Home() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<Collection | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tab, setTab] = useState<Tab>("documents");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [initDone, setInitDone] = useState(false);

  // Create collection
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newChunkSize, setNewChunkSize] = useState(200);
  const [newOverlap, setNewOverlap] = useState(50);

  // Add text
  const [textInput, setTextInput] = useState("");
  const [addingText, setAddingText] = useState(false);
  const [progress, setProgress] = useState("");

  // Search
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Vis
  const [visData, setVisData] = useState<{ points: { x: number; y: number }[]; docs: VectorPoint[] } | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [searchHighlights, setSearchHighlights] = useState<Set<string>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Init DB
  useEffect(() => {
    if (!initDone) {
      fetch("/api/init", { method: "POST" })
        .then(() => setInitDone(true))
        .catch(console.error);
    }
  }, [initDone]);

  // Load collections
  const loadCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections");
      const data = await res.json();
      setCollections(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (initDone) loadCollections();
  }, [initDone, loadCollections]);

  // Load docs when collection selected
  useEffect(() => {
    if (selected) {
      fetch(`/api/documents?collectionId=${selected.id}`)
        .then((r) => r.json())
        .then(setDocs)
        .catch(console.error);
    }
  }, [selected]);

  const createCollection = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDesc,
          chunkSize: newChunkSize,
          chunkOverlap: newOverlap,
        }),
      });
      const col = await res.json();
      setCollections((prev) => [{ ...col, doc_count: 0 }, ...prev]);
      setSelected({ ...col, doc_count: 0 });
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
    } finally {
      setLoading(false);
    }
  };

  const deleteCollection = async (id: string) => {
    await fetch("/api/collections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setCollections((prev) => prev.filter((c) => c.id !== id));
    if (selected?.id === id) {
      setSelected(null);
      setDocs([]);
    }
  };

  const addText = async () => {
    if (!selected || !textInput.trim()) return;
    setAddingText(true);
    try {
      setProgress("Chunking text...");
      const chunks = chunkText(textInput, selected.chunk_size, selected.chunk_overlap);

      setModelStatus("loading");
      setProgress(`Loading embedding model...`);
      
      const embeddings: number[][] = [];
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Generating embeddings... ${i + 1}/${chunks.length}`);
        const emb = await generateEmbedding(chunks[i]);
        embeddings.push(emb);
        setModelStatus("ready");
      }

      setProgress("Storing in database...");
      const payload = chunks.map((content, i) => ({
        content,
        embedding: embeddings[i],
      }));

      await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: selected.id, chunks: payload }),
      });

      // Reload
      const res = await fetch(`/api/documents?collectionId=${selected.id}`);
      setDocs(await res.json());
      await loadCollections();
      setTextInput("");
      setProgress("");
    } catch (e) {
      console.error(e);
      setProgress("Error: " + (e as Error).message);
    } finally {
      setAddingText(false);
    }
  };

  const searchDocs = async () => {
    if (!selected || !query.trim()) return;
    setSearching(true);
    try {
      setModelStatus("loading");
      const embedding = await generateEmbedding(query);
      setModelStatus("ready");

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId: selected.id, embedding, topK }),
      });
      const data = await res.json();
      setResults(data);
      setSearchHighlights(new Set(data.map((r: SearchResult) => r.id)));
    } finally {
      setSearching(false);
    }
  };

  const loadVisualization = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/vectors?collectionId=${selected.id}`);
      const data: VectorPoint[] = await res.json();
      if (data.length < 2) {
        setVisData({ points: data.map(() => ({ x: 0, y: 0 })), docs: data });
        return;
      }
      const vectors = data.map((d) => d.embedding);
      const points = projectTo2D(vectors);
      setVisData({ points, docs: data });
    } finally {
      setLoading(false);
    }
  };

  // Draw canvas
  useEffect(() => {
    if (!visData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, w, h);

    if (visData.points.length === 0) return;

    // Find bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of visData.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 40;

    const toScreen = (p: { x: number; y: number }) => ({
      sx: pad + ((p.x - minX) / rangeX) * (w - pad * 2),
      sy: pad + ((p.y - minY) / rangeY) * (h - pad * 2),
    });

    // Draw grid
    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const x = pad + (i / 4) * (w - pad * 2);
      const y = pad + (i / 4) * (h - pad * 2);
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
    }

    // Draw points
    visData.points.forEach((p, i) => {
      const { sx, sy } = toScreen(p);
      const isHighlighted = searchHighlights.has(visData.docs[i].id);
      const isHovered = hoveredPoint === i;

      ctx.beginPath();
      ctx.arc(sx, sy, isHovered ? 8 : isHighlighted ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isHighlighted ? "#f59e0b" : isHovered ? "#8b5cf6" : "#6366f1";
      ctx.fill();

      if (isHighlighted || isHovered) {
        ctx.strokeStyle = isHighlighted ? "#fbbf24" : "#a78bfa";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Axis labels
    ctx.fillStyle = "#71717a";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("PC1", w / 2, h - 8);
    ctx.save();
    ctx.translate(12, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("PC2", 0, 0);
    ctx.restore();
  }, [visData, hoveredPoint, searchHighlights]);

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!visData || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const pad = 40;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of visData.points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    let closest = -1;
    let closestDist = 20;
    visData.points.forEach((p, i) => {
      const sx = pad + ((p.x - minX) / rangeX) * (w - pad * 2);
      const sy = pad + ((p.y - minY) / rangeY) * (h - pad * 2);
      const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
      if (dist < closestDist) { closest = i; closestDist = dist; }
    });
    setHoveredPoint(closest >= 0 ? closest : null);
  };

  return (
    <div className="min-h-screen flex">
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-zinc-950 border-b border-zinc-800 px-4 h-14 flex items-center gap-3">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors">
          <Menu className="w-5 h-5" />
        </button>
        <Box className="w-4 h-4 text-indigo-400" />
        <span className="font-bold text-sm">VectorLab</span>
      </div>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed md:static z-50 h-full w-72 border-r border-zinc-800 flex flex-col bg-zinc-950 transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-1">
            <Box className="w-5 h-5 text-indigo-400" />
            <h1 className="text-lg font-bold">VectorLab</h1>
          </div>
          <p className="text-xs text-zinc-500">Vector DB Playground</p>
        </div>

        <div className="p-3">
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> New Collection
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {collections.map((col) => (
            <div
              key={col.id}
              onClick={() => { setSelected(col); setTab("documents"); setSidebarOpen(false); }}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                selected?.id === col.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-sm truncate">{col.name}</span>
                </div>
                <span className="text-xs text-zinc-600 ml-5.5">{col.doc_count} chunks</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteCollection(col.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Model status */}
        <div className="p-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${
              modelStatus === "ready" ? "bg-emerald-400" : modelStatus === "loading" ? "bg-amber-400 animate-pulse" : "bg-zinc-600"
            }`} />
            <span className="text-zinc-500">
              {modelStatus === "ready" ? "Model loaded" : modelStatus === "loading" ? "Loading model..." : "Model idle"}
            </span>
          </div>
          <p className="text-[10px] text-zinc-700 mt-1">all-MiniLM-L6-v2 (384d) - runs in browser</p>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col pt-14 md:pt-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <Box className="w-16 h-16 mx-auto text-indigo-400 mb-4" />
              <h2 className="text-2xl font-bold mb-2">VectorLab</h2>
              <p className="text-zinc-400 mb-6">
                Experiment with vector embeddings and similarity search. Paste text, 
                generate embeddings in your browser, search semantically, and visualise the vector space.
              </p>
              <div className="grid grid-cols-3 gap-3 text-xs text-zinc-500">
                <div className="bg-zinc-900 rounded-lg p-3">
                  <Upload className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
                  <p>Paste text & auto-chunk</p>
                </div>
                <div className="bg-zinc-900 rounded-lg p-3">
                  <Search className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
                  <p>Semantic similarity search</p>
                </div>
                <div className="bg-zinc-900 rounded-lg p-3">
                  <BarChart3 className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
                  <p>2D vector visualisation</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-6 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
              >
                Create your first collection
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tab header */}
            <div className="border-b border-zinc-800 px-6 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-semibold">{selected.name}</h2>
                <span className="text-xs text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded">
                  {selected.chunk_size}w chunks / {selected.chunk_overlap}w overlap
                </span>
              </div>
              {selected.description && (
                <p className="text-sm text-zinc-500 mb-3">{selected.description}</p>
              )}
              <div className="flex gap-1">
                {(["documents", "search", "visualise"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTab(t);
                      if (t === "visualise") loadVisualization();
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                      tab === t ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {t === "documents" && <Upload className="w-4 h-4 inline mr-1.5" />}
                    {t === "search" && <Search className="w-4 h-4 inline mr-1.5" />}
                    {t === "visualise" && <Eye className="w-4 h-4 inline mr-1.5" />}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              <AnimatePresence mode="wait">
                {tab === "documents" && (
                  <motion.div
                    key="docs"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    {/* Add text */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium mb-2">Add Text</label>
                      <textarea
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Paste your text here. It will be automatically chunked and embedded..."
                        className="w-full h-40 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-zinc-600"
                      />
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-zinc-600">
                          {textInput.split(/\s+/).filter(Boolean).length} words
                          {textInput.trim() && ` → ~${chunkText(textInput, selected.chunk_size, selected.chunk_overlap).length} chunks`}
                        </span>
                        <button
                          onClick={addText}
                          disabled={addingText || !textInput.trim()}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-lg text-sm font-medium transition-colors"
                        >
                          {addingText ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> {progress}</>
                          ) : (
                            <><Zap className="w-4 h-4" /> Embed & Store</>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Chunks list */}
                    <div>
                      <h3 className="text-sm font-medium mb-3">Stored Chunks ({docs.length})</h3>
                      <div className="space-y-2">
                        {docs.map((doc) => (
                          <div
                            key={doc.id}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono text-zinc-600">#{doc.chunk_index}</span>
                              {doc.has_embedding && (
                                <span className="text-[10px] bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded">
                                  embedded
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-zinc-300 line-clamp-2">{doc.content}</p>
                          </div>
                        ))}
                        {docs.length === 0 && (
                          <p className="text-sm text-zinc-600 text-center py-8">
                            No documents yet. Paste some text above to get started.
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {tab === "search" && (
                  <motion.div
                    key="search"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="mb-6">
                      <label className="block text-sm font-medium mb-2">Semantic Search</label>
                      <div className="flex gap-2">
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && searchDocs()}
                          placeholder="Type a natural language query..."
                          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-zinc-600"
                        />
                        <select
                          value={topK}
                          onChange={(e) => setTopK(Number(e.target.value))}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        >
                          {[3, 5, 10, 20].map((k) => (
                            <option key={k} value={k}>Top {k}</option>
                          ))}
                        </select>
                        <button
                          onClick={searchDocs}
                          disabled={searching || !query.trim()}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                        >
                          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                          Search
                        </button>
                      </div>
                    </div>

                    {results.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium">Results</h3>
                        {results.map((r, i) => (
                          <div
                            key={r.id}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-indigo-400">#{i + 1}</span>
                                <span className="text-xs font-mono text-zinc-600">chunk {r.chunk_index}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-indigo-500 rounded-full"
                                    style={{ width: `${Math.max(0, r.similarity * 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-mono text-amber-400">
                                  {(r.similarity * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            <p className="text-sm text-zinc-300">{r.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                {tab === "visualise" && (
                  <motion.div
                    key="vis"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-medium">Vector Space (PCA 2D Projection)</h3>
                        <p className="text-xs text-zinc-500">Hover over points to see chunk content. Yellow = search results.</p>
                      </div>
                      <button
                        onClick={loadVisualization}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
                      >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                        Refresh
                      </button>
                    </div>

                    <div className="relative bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                      <canvas
                        ref={canvasRef}
                        className="w-full"
                        style={{ height: 500 }}
                        onMouseMove={handleCanvasMove}
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                      {hoveredPoint !== null && visData && (
                        <div className="absolute top-3 right-3 max-w-xs bg-zinc-800 border border-zinc-700 rounded-lg p-3 shadow-xl">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-zinc-500">
                              Chunk #{visData.docs[hoveredPoint].chunkIndex}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-300 line-clamp-4">
                            {visData.docs[hoveredPoint].content}
                          </p>
                        </div>
                      )}
                      {visData && visData.points.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <p className="text-sm text-zinc-600">No embedded documents to visualise</p>
                        </div>
                      )}
                    </div>

                    {visData && visData.points.length > 0 && (
                      <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-indigo-500" />
                          <span>Document chunks</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-amber-500" />
                          <span>Search results</span>
                        </div>
                        <span className="ml-auto">{visData.points.length} vectors plotted</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">New Collection</h3>
                <button onClick={() => setShowCreate(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Name</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Research Papers"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Description (optional)</label>
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="What's this collection about?"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Chunk size (words)</label>
                    <input
                      type="number"
                      value={newChunkSize}
                      onChange={(e) => setNewChunkSize(Number(e.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Overlap (words)</label>
                    <input
                      type="number"
                      value={newOverlap}
                      onChange={(e) => setNewOverlap(Number(e.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={createCollection}
                disabled={loading || !newName.trim()}
                className="w-full mt-5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                Create Collection
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
