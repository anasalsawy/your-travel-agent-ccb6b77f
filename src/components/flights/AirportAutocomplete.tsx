import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Place {
  id: string;
  name: string;
  iata_code: string;
  iata_city_code?: string;
  type: string;
  city_name?: string;
}

interface Props {
  value: string;
  onChange: (iata: string) => void;
  placeholder?: string;
  id?: string;
  inputClassName?: string;
  menuClassName?: string;
}

const POPULAR_AIRPORTS: Place[] = [
  { id: "cai", name: "Cairo International Airport", iata_code: "CAI", type: "airport", city_name: "Cairo" },
  { id: "dxb", name: "Dubai International Airport", iata_code: "DXB", type: "airport", city_name: "Dubai" },
  { id: "jfk", name: "John F. Kennedy International Airport", iata_code: "JFK", type: "airport", city_name: "New York" },
  { id: "lhr", name: "Heathrow Airport", iata_code: "LHR", type: "airport", city_name: "London" },
  { id: "doh", name: "Hamad International Airport", iata_code: "DOH", type: "airport", city_name: "Doha" },
];

export function AirportAutocomplete({ value, onChange, placeholder, id, inputClassName, menuClassName }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (!query || query.length < 2 || query.length === 3) {
      setResults([]);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await supabase.functions.invoke("duffel-places", { body: { query } });
        setResults(data?.places || []);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 250);
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={wrapRef}>
      <Input
        id={id}
        value={query}
        placeholder={placeholder || "City or airport"}
        className={inputClassName ?? "bg-white text-slate-900 placeholder:text-slate-500"}
        onChange={(e) => {
          const v = e.target.value.toUpperCase();
          setQuery(v);
          setOpen(true);
          if (v.length === 3) onChange(v);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && (results.length > 0 || loading || query.length < 2) && (
        <div className={`absolute z-50 mt-1 w-full bg-white text-slate-900 border border-slate-200 rounded-md shadow-lg max-h-72 overflow-y-auto ${menuClassName ?? ""}`}>
          {loading && <div className="p-2 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Searching…</div>}
          {!loading && query.length < 2 && (
            <>
              <div className="p-2 text-xs text-muted-foreground border-b">Popular airports</div>
              {POPULAR_AIRPORTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left p-2 hover:bg-muted text-sm border-b last:border-b-0"
                  onClick={() => {
                    onChange(p.iata_code);
                    setQuery(p.iata_code + " — " + p.name);
                    setOpen(false);
                  }}
                >
                  <div className="font-semibold">{p.iata_code} · {p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.city_name || p.type}</div>
                </button>
              ))}
            </>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left p-2 hover:bg-muted text-sm border-b last:border-b-0"
              onClick={() => {
                onChange(p.iata_code);
                setQuery(p.iata_code + " — " + p.name);
                setOpen(false);
              }}
            >
              <div className="font-semibold">{p.iata_code} · {p.name}</div>
              <div className="text-xs text-muted-foreground">{p.city_name || p.type}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
