function fromCandidate(cand: string) {
  const m = cand.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (!m) return "";
  const ip = m[1];
  if (ip.startsWith("127.") || ip.startsWith("169.254.")) return "";
  const a = Number(ip.split(".")[0]);
  const b = Number(ip.split(".")[1]);
  if (a === 10 || a === 192 || (a === 172 && b >= 16 && b <= 31)) return ip;
  return "";
}

export async function collectOfficeHints() {
  const found = new Set<string>();
  if (typeof RTCPeerConnection === "undefined") return [];
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
      void pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(done);
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
