import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { dbClient } from "../../lib/turso";
import { createGroup } from "../../lib/turso";

type Contact = { uid: string; name: string; email: string; avatar: string };

function Ico({d, s=20, c='currentColor'}: {d:string; s?:number; c?:string}) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{__html: d}}/>
}

const I = {
  x: (p:any)=> <Ico {...p} d='<path d="M18 6L6 18M6 6l12 12"/>' />,
  check: (p:any)=> <Ico {...p} d='<path d="M20 6L9 17l-5-5"/>' />,
  users: (p:any)=> <Ico {...p} d='<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' />,
  camera: (p:any)=> <Ico {...p} d='<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>' />,
  arrowLeft: (p:any)=> <Ico {...p} d='<path d="M19 12H5M12 19l-7-7 7-7"/>' />,
};

export default function GroupCreateWizard({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<1|2>(1);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [groupName, setGroupName] = useState("");
  const [description, setDescription] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      try {
        const res = await dbClient().execute({
          sql: `SELECT id, name, email, avatar FROM users WHERE id != ? ORDER BY name ASC LIMIT 120`,
          args: [user.uid],
        });
        setContacts((res.rows as any[]).map(r => ({
          uid: String(r.id), name: String(r.name), email: String(r.email),
          avatar: String(r.avatar || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(String(r.name))}&backgroundColor=f1ede7,ebe4d7&fontWeight=600`),
        })));
      } catch {}
    })();
  }, [open, user]);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1); setSelected(new Set()); setQ(""); setGroupName(""); setDescription(""); setIconUrl("");
      }, 400);
    }
  }, [open]);

  const toggle = (uid: string) => {
    setSelected(s => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid); else n.add(uid);
      return n;
    });
  };

  const filtered = contacts.filter(c =>
    !q.trim() || c.name.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase())
  );

  const handleCreate = async () => {
    if (!user || !groupName.trim() || selected.size === 0) return;
    setCreating(true);
    try {
      await createGroup({
        ownerId: user.uid,
        ownerName: user.name,
        name: groupName.trim(),
        description: description.trim(),
        iconUrl: iconUrl || null,
        memberIds: Array.from(selected),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      alert(e.message || "Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  const handleIconPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => setIconUrl(reader.result as string);
      reader.readAsDataURL(f);
    } finally { setUploading(false); }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] bg-black/65 backdrop-blur-[10px]" onClick={onClose} />
          <motion.div
            initial={{ y: "100%", opacity: 0.8 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-[161] mx-auto max-w-[420px] max-h-[86vh] overflow-hidden flex flex-col"
            style={{
              background: "linear-gradient(178deg, #1E1A14 0%, #14110D 40%, #0F0D0A 100%)",
              borderRadius: "28px 28px 0 0",
              borderTop: "1px solid rgba(216,173,90,0.18)",
              boxShadow: "0 -18px 60px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,235,190,0.07)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(216,173,90,0.08)] flex-shrink-0">
              <div className="flex items-center gap-3">
                {step === 2 && (
                  <button onClick={() => setStep(1)} className="w-8 h-8 rounded-xl flex items-center justify-center text-[#8A7D67] hover:bg-white/[0.06] transition-colors">
                    <I.arrowLeft s={18} />
                  </button>
                )}
                <div>
                  <p className="text-[11px] font-bold text-[#6E6353] uppercase tracking-wider">Create Group</p>
                  <p className="text-[16px] font-bold text-[#F3EADB]">{step === 1 ? "Select members" : "Group details"}</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-[#6E6353] hover:bg-white/[0.06]">
                <I.x s={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {step === 1 ? (
                  <motion.div key="s1" initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 18 }} transition={{ duration: .28 }} className="px-5 py-4">
                    {/* search */}
                    <div className="flex items-center gap-3 rounded-2xl px-4 h-[44px] mb-3"
                      style={{ background: "rgba(255,244,210,0.04)", border: "1px solid rgba(255,244,210,0.08)" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A7D67" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search contacts…"
                        className="flex-1 bg-transparent text-[13px] text-[#F3EADB] placeholder-[#6E6353] outline-none" />
                    </div>

                    {/* selected chips */}
                    {selected.size > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {Array.from(selected).map(uid => {
                          const c = contacts.find(x => x.uid === uid);
                          if (!c) return null;
                          return (
                            <span key={uid} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-[#F3EADB]"
                              style={{ background: "rgba(216,173,90,0.12)", border: "1px solid rgba(216,173,90,0.28)" }}>
                              {c.name.split(" ")[0]}
                              <button onClick={() => toggle(uid)} className="text-[#D8AD5A] hover:text-[#F3EADB]">×</button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* list */}
                    <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                      {filtered.map(c => {
                        const on = selected.has(c.uid);
                        return (
                          <button key={c.uid} onClick={() => toggle(c.uid)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left"
                            style={{ background: on ? "rgba(216,173,90,0.08)" : "transparent", border: on ? "1px solid rgba(216,173,90,0.18)" : "1px solid transparent" }}>
                            <img src={c.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-bold text-[#F3EADB] truncate">{c.name}</p>
                              <p className="text-[11px] text-[#6E6353] truncate">{c.email}</p>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${on ? "border-[#D8AD5A] bg-[#D8AD5A]" : "border-[#3A332A]"}`}>
                              {on && <I.check s={10} c="#1A1206" />}
                            </div>
                          </button>
                        );
                      })}
                      {!filtered.length && (
                        <div className="py-10 text-center text-[#6E6353] text-[12px]">No contacts found</div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="s2" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: .28 }} className="px-5 py-5 space-y-5">
                    {/* icon */}
                    <div className="flex flex-col items-center">
                      <div className="relative">
                        <div className="w-24 h-24 rounded-[22px] overflow-hidden flex items-center justify-center"
                          style={{ background: iconUrl ? "transparent" : "linear-gradient(160deg,#2A2520,#14110D)", border: "1.5px solid rgba(216,173,90,0.22)", boxShadow: "0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,248,222,0.08)" }}>
                          {iconUrl ? <img src={iconUrl} className="w-full h-full object-cover" /> : (
                            <I.users s={30} c="#6E6353" />
                          )}
                        </div>
                        <label className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
                          style={{ background: "linear-gradient(170deg,#FFF1CC,#E3B25D 42%,#A87527 82%)", boxShadow: "0 2px 8px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,248,220,.6)" }}>
                          <I.camera s={16} c="#1A1206" />
                          <input type="file" accept="image/*" hidden onChange={handleIconPick} />
                        </label>
                      </div>
                      {uploading && <p className="text-[11px] text-[#8A7D67] mt-2">Uploading…</p>}
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#6E6353] uppercase tracking-wider">Group name</label>
                      <input value={groupName} onChange={e => setGroupName(e.target.value)} maxLength={40} placeholder="The Circle"
                        className="mt-1.5 w-full h-[48px] px-4 rounded-xl bg-[rgba(255,244,210,0.045)] border border-[rgba(255,244,210,0.1)] text-[#F3EADB] text-[14px] font-medium placeholder-[#6E6353] outline-none focus:border-[rgba(216,173,90,0.35)]" />
                      <p className="text-[11px] text-[#4A4339] text-right mt-1">{groupName.length}/40</p>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#6E6353] uppercase tracking-wider">Description <span className="text-[#4A4339] font-normal lowercase">optional</span></label>
                      <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={140}
                        placeholder="What is this group about?"
                        className="mt-1.5 w-full h-[84px] px-4 py-3 rounded-xl bg-[rgba(255,244,210,0.045)] border border-[rgba(255,244,210,0.1)] text-[#F3EADB] text-[13px] font-medium placeholder-[#6E6353] outline-none resize-none focus:border-[rgba(216,173,90,0.35)]" />
                    </div>

                    <div className="rounded-2xl px-3 py-3" style={{ background: "rgba(255,244,210,0.035)", border: "1px solid rgba(255,244,210,0.07)" }}>
                      <p className="text-[12px] text-[#8A7D67] font-medium">Members: <b className="text-[#EFC878]">{selected.size + 1}</b></p>
                      <p className="text-[11px] text-[#5E5648] mt-0.5">You will be the group owner</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* footer */}
            <div className="border-t border-[rgba(216,173,90,0.08)] px-5 py-4 flex-shrink-0">
              {step === 1 ? (
                <button disabled={!selected.size}
                  onClick={() => setStep(2)}
                  className="w-full h-[48px] rounded-2xl font-bold text-[15px] text-black transition-opacity disabled:opacity-40"
                  style={{ background: "linear-gradient(170deg,#FFF1CC,#F7D185 20%,#E3B25D 42%,#C9913B 62%,#A87527 82%)", textShadow:"0 1px 0 rgba(255,243,214,0.55)", boxShadow:"0 1px 0 rgba(255,248,220,.7) inset, 0 -2px 4px rgba(90,62,14,.55) inset, 0 2px 5px rgba(0,0,0,.55)" }}>
                  Continue {selected.size ? `(${selected.size})` : ""}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setStep(1)} className="px-4 h-[48px] rounded-2xl text-[#8A7D67] text-[13px] font-semibold"
                    style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)" }}>
                    Back
                  </button>
                  <button disabled={!groupName.trim() || creating}
                    onClick={handleCreate}
                    className="flex-1 h-[48px] rounded-2xl font-bold text-[15px] text-black disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(170deg,#FFF1CC,#F7D185 20%,#E3B25D 42%,#C9913B 62%,#A87527 82%)", textShadow:"0 1px 0 rgba(255,243,214,0.55)", boxShadow:"0 1px 0 rgba(255,248,220,.7) inset, 0 -2px 4px rgba(90,62,14,.55) inset, 0 2px 5px rgba(0,0,0,.55)" }}>
                    {creating ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : "Create Group"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
// keep lint happy
export const _GroupCreateWizard = GroupCreateWizard;