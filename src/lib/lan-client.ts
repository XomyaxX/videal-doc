const OFFICE_BEACONS = ["http://192.168.1.51/api/office-beacon"];

function fromCandidate(cand: string) {
  const m = cand.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (!m) return "";
  const ip = m[1];
  if (ip.startsWith("127.") || ip.startsWith("169.254.")) return "";
  const a = Number(ip.split(".")[0]);
  const b = Number(ip.split(".")[1]);
  if (a === 192 && b === 168) return ip;
  if (a === 10 && b !== 8) return ip;
  if (a === 172 && b >= 16 && b <= 31) return ip;
  return "";
}

async function fromBeacons() {
  const urls = [...OFFICE_BEACONS];
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (window.location.protocol === "https:") {
      return [];
    }
    if (host.startsWith("192.168.") || (host.startsWith("10.") && !host.startsWith("10.8."))) {
      urls.unshift(`${window.location.protocol}//${window.location.host}/api/office-beacon`);
    }
  }
  const found: string[] = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { mode: "cors", cache: "no-store", signal: AbortSignal.timeout(1500) });
        const data = await res.json().catch(() => null);
        const ip = String(data?.lan || data?.ip || "");
        if (fromCandidate(ip)) found.push(ip);
      } catch {
        /* mixed content / offline */
      }
    }),
  );
  return found;
}

export async function collectOfficeHints() {
  const found = new Set<string>();
  for (const ip of await fromBeacons()) found.add(ip);
  if (typeof RTCPeerConnection === "undefined") return [...found];
  const pc = new RTCPeerConnection({ iceServers: [] });
  try {
    pc.createDataChannel("vd");
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      const t = setTimeout(done, 800);
      pc.onicecandidate = (ev) => {
        const ip = ev.candidate?.candidate ? fromCandidate(ev.candidate.candidate) : "";
        if (ip) found.add(ip);
        if (!ev.candidate) {
          clearTimeout(t);
          done();
        }
      };
      void pc
        .createOffer()
        .then((o) => pc.setLocalDescription(o))
        .catch(done);
    });
  } catch {
    /* ignore */
  }
  try {
    pc.close();
  } catch {
    /* ignore */
  }
  return [...found];
}

export function officeLanOrigin() {
  return "http://192.168.1.51";
}
