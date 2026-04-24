import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

type UserRole = "user" | "admin";
type SubscriptionPlan = "monthly" | "yearly";
type SubscriptionStatus = "active" | "canceled";
type BillingPaymentMethod = "card" | "mobile_money" | "paypal";
type BillingTransactionStatus = "paid" | "failed";
type BillingStatusFilter = "all" | BillingTransactionStatus;
type BillingPlanFilter = "all" | SubscriptionPlan;

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

type AuthResponse = {
  token: string;
  user: AuthUser;
};

type CatalogItem = {
  id: string;
  title: string;
  type: string;
  year: number;
  status?: string;
  synopsis?: string;
};

type MoodItem = {
  key: string;
  label: string;
};

type PersonalState = {
  watchlist: string[];
  progress: Record<string, number>;
};

type SubscriptionRecord = {
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: string;
  renewAt: string | null;
  canceledAt: string | null;
};

type BillingTransactionRecord = {
  id: string;
  receiptCode: string;
  userId: string;
  plan: SubscriptionPlan;
  amountCents: number;
  currency: string;
  paymentMethod: BillingPaymentMethod;
  status: BillingTransactionStatus;
  createdAt: string;
};

const TOKEN_KEY = "muse_mobile_token";
const LOCAL_API_URL = "http://localhost:4000";

function resolveApiUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!raw) return LOCAL_API_URL;
  return raw.replace(/\/+$/, "");
}

export default function App() {
  const apiUrl = useMemo(() => resolveApiUrl(), []);

  const [activeTab, setActiveTab] = useState<"discover" | "account" | "collab">("discover");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("Muse Mobile");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [recommendations, setRecommendations] = useState<CatalogItem[]>([]);
  const [moods, setMoods] = useState<MoodItem[]>([{ key: "all", label: "Tous" }]);
  const [activeMood, setActiveMood] = useState("all");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingTransactionRecord[]>([]);
  const [billingStatusFilter, setBillingStatusFilter] = useState<BillingStatusFilter>("all");
  const [billingPlanFilter, setBillingPlanFilter] = useState<BillingPlanFilter>("all");

  const [collabMessage, setCollabMessage] = useState({ name: "", email: "", organization: "", interestArea: "", message: "" });
  const [feedbackForm, setFeedbackForm] = useState({ name: "", email: "", rating: "5", comment: "" });
  const [submissionForm, setSubmissionForm] = useState({ creatorName: "", creatorEmail: "", title: "", type: "film", synopsis: "", pitch: "" });
  const [collabStatus, setCollabStatus] = useState<string | null>(null);

  function buildBillingHistoryUrl(status: BillingStatusFilter, plan: BillingPlanFilter): string {
    const params = new URLSearchParams();
    params.set("limit", "20");
    params.set("status", status);
    params.set("plan", plan);
    return `${apiUrl}/api/v1/me/billing/history?${params.toString()}`;
  }

  const loadBillingHistory = useCallback(async (jwtToken: string, status: BillingStatusFilter, plan: BillingPlanFilter) => {
    const res = await fetch(buildBillingHistoryUrl(status, plan), {
      headers: { Authorization: `Bearer ${jwtToken}` }
    });

    if (!res.ok) {
      setBillingHistory([]);
      return;
    }

    const data = (await res.json()) as { items?: BillingTransactionRecord[] };
    setBillingHistory(data.items ?? []);
  }, [apiUrl]);

  const loadMoods = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/catalog/moods`);
      if (!res.ok) return;
      const data = (await res.json()) as { items?: MoodItem[] };
      if (!Array.isArray(data.items)) return;
      setMoods([{ key: "all", label: "Tous" }, ...data.items]);
    } catch {
      setMoods([{ key: "all", label: "Tous" }]);
    }
  }, [apiUrl]);

  const loadRecommendations = useCallback(async (mood: string) => {
    try {
      const params = new URLSearchParams({ mood, limit: "8" });
      const res = await fetch(`${apiUrl}/api/v1/catalog/recommendations?${params.toString()}`);
      if (!res.ok) {
        setRecommendations([]);
        return;
      }
      const data = (await res.json()) as { items?: CatalogItem[] };
      setRecommendations(data.items ?? []);
    } catch {
      setRecommendations([]);
    }
  }, [apiUrl]);

  const loadAppData = useCallback(async (jwtToken: string) => {
    const headers = { Authorization: `Bearer ${jwtToken}` };

    try {
      const [meRes, catalogRes, stateRes, subRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/auth/me`, { headers }),
        fetch(`${apiUrl}/api/v1/catalog/enriched?limit=24`),
        fetch(`${apiUrl}/api/v1/me/state`, { headers }),
        fetch(`${apiUrl}/api/v1/me/subscription`, { headers })
      ]);

      if (!meRes.ok || !catalogRes.ok || !stateRes.ok || !subRes.ok) {
        throw new Error("Impossible de charger les donnees");
      }

      const me = (await meRes.json()) as AuthUser;
      const catalogData = (await catalogRes.json()) as { items?: CatalogItem[] };
      const state = (await stateRes.json()) as PersonalState;
      const subData = (await subRes.json()) as { subscription?: SubscriptionRecord | null };

      setUser(me);
      setCatalog(catalogData.items ?? []);
      setWatchlist(state.watchlist ?? []);
      setProgress(state.progress ?? {});
      setSubscription(subData.subscription ?? null);
      await loadBillingHistory(jwtToken, billingStatusFilter, billingPlanFilter);
      setError(null);
    } catch {
      setError("Session invalide ou API inaccessible.");
      await logout();
    }
  }, [apiUrl, loadBillingHistory, billingStatusFilter, billingPlanFilter]);

  useEffect(() => {
    void loadMoods();
  }, [loadMoods]);

  useEffect(() => {
    void loadRecommendations(activeMood);
  }, [activeMood, loadRecommendations]);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(TOKEN_KEY);
      if (!stored) {
        try {
          const catalogRes = await fetch(`${apiUrl}/api/v1/catalog/enriched?limit=24`);
          if (catalogRes.ok) {
            const catalogData = (await catalogRes.json()) as { items?: CatalogItem[] };
            setCatalog(catalogData.items ?? []);
          }
        } catch {
          setCatalog([]);
        }
        return;
      }

      setToken(stored);
      await loadAppData(stored);
    })();
  }, [apiUrl, loadAppData]);

  useEffect(() => {
    if (!token) return;
    void loadBillingHistory(token, billingStatusFilter, billingPlanFilter);
  }, [token, billingStatusFilter, billingPlanFilter, loadBillingHistory]);

  async function submitAuth() {
    setLoading(true);
    setError(null);

    const endpoint = mode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register";
    const payload = mode === "login"
      ? { email, password }
      : { name, email, password };

    try {
      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(mode === "login" ? "Identifiants invalides" : "Inscription impossible");
      }

      const data = (await res.json()) as AuthResponse;
      setToken(data.token);
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      await loadAppData(data.token);
      setPassword("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur d'authentification";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setToken(null);
    setUser(null);
    setWatchlist([]);
    setProgress({});
    setSubscription(null);
    setBillingHistory([]);
    await AsyncStorage.removeItem(TOKEN_KEY);
  }

  async function toggleWatchlist(contentId: string) {
    if (!token) {
      setError("Connecte-toi pour gerer les favoris.");
      return;
    }

    const already = watchlist.includes(contentId);
    const method = already ? "DELETE" : "POST";
    const url = already
      ? `${apiUrl}/api/v1/me/watchlist/${encodeURIComponent(contentId)}`
      : `${apiUrl}/api/v1/me/watchlist`;

    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    };

    if (!already) {
      init.body = JSON.stringify({ contentId });
    }

    const res = await fetch(url, init);
    if (!res.ok) {
      setError("Mise a jour favoris impossible.");
      return;
    }

    const data = (await res.json()) as { items?: string[] };
    setWatchlist(data.items ?? []);
  }

  async function updateProgress(contentId: string, delta: number) {
    if (!token) {
      setError("Connecte-toi pour sauvegarder la progression.");
      return;
    }

    const current = progress[contentId] ?? 0;
    const next = Math.max(0, Math.min(100, current + delta));

    const res = await fetch(`${apiUrl}/api/v1/me/progress/${encodeURIComponent(contentId)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ progress: next })
    });

    if (!res.ok) {
      setError("Sauvegarde progression impossible.");
      return;
    }

    setProgress((prev) => ({ ...prev, [contentId]: next }));
  }

  async function checkout(plan: SubscriptionPlan) {
    if (!token) {
      setError("Connecte-toi pour t'abonner.");
      return;
    }

    const res = await fetch(`${apiUrl}/api/v1/me/billing/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ plan, paymentMethod: "card" })
    });

    const data = (await res.json()) as {
      error?: string;
      subscription?: SubscriptionRecord | null;
    };

    if (!res.ok) {
      setError(data.error ?? "Paiement impossible.");
      await loadBillingHistory(token, billingStatusFilter, billingPlanFilter);
      return;
    }

    setSubscription(data.subscription ?? null);
    setError(null);
    await loadBillingHistory(token, billingStatusFilter, billingPlanFilter);
  }

  async function cancelSubscription() {
    if (!token) return;

    const res = await fetch(`${apiUrl}/api/v1/me/subscription/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      setError("Annulation abonnement impossible.");
      return;
    }

    const data = (await res.json()) as { subscription?: SubscriptionRecord | null };
    setSubscription(data.subscription ?? null);
    setError(null);
  }

  async function submitCollaboratorMessage() {
    const res = await fetch(`${apiUrl}/api/v1/public/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collabMessage)
    });

    if (!res.ok) {
      setCollabStatus("Envoi message impossible.");
      return;
    }

    setCollabStatus("Message collaborateur envoye.");
    setCollabMessage({ name: "", email: "", organization: "", interestArea: "", message: "" });
  }

  async function submitFeedback() {
    const rating = Math.max(1, Math.min(5, Number(feedbackForm.rating) || 5));
    const res = await fetch(`${apiUrl}/api/v1/public/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...feedbackForm, rating })
    });

    if (!res.ok) {
      setCollabStatus("Envoi avis impossible.");
      return;
    }

    setCollabStatus("Avis envoye.");
    setFeedbackForm({ name: "", email: "", rating: "5", comment: "" });
  }

  async function submitSubmission() {
    const res = await fetch(`${apiUrl}/api/v1/public/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submissionForm)
    });

    if (!res.ok) {
      setCollabStatus("Soumission impossible.");
      return;
    }

    setCollabStatus("Projet soumis a l'equipe Muse.");
    setSubmissionForm({ creatorName: "", creatorEmail: "", title: "", type: "film", synopsis: "", pitch: "" });
  }

  const subscriptionLabel = subscription
    ? `${subscription.plan === "monthly" ? "Mensuel" : "Annuel"} - ${subscription.status === "active" ? "Actif" : "Annule"}`
    : "Aucun abonnement";

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>MUSE ORIGIN STUDIO.</Text>
            <Text style={styles.subtitle}>where creativity meets professional production</Text>
          </View>
          {user && (
            <Pressable style={styles.ghostButton} onPress={logout}>
              <Text style={styles.ghostButtonText}>Logout</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.tabRow}>
          <Pressable style={activeTab === "discover" ? styles.tabActive : styles.tab} onPress={() => setActiveTab("discover")}><Text style={styles.tabText}>Decouvrir</Text></Pressable>
          <Pressable style={activeTab === "account" ? styles.tabActive : styles.tab} onPress={() => setActiveTab("account")}><Text style={styles.tabText}>Compte</Text></Pressable>
          <Pressable style={activeTab === "collab" ? styles.tabActive : styles.tab} onPress={() => setActiveTab("collab")}><Text style={styles.tabText}>Collaborer</Text></Pressable>
        </View>

        {activeTab === "discover" && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>MoodEngine</Text>
              <View style={styles.buttonRow}>
                {moods.map((mood) => (
                  <Pressable key={mood.key} style={activeMood === mood.key ? styles.smallButtonActive : styles.smallButton} onPress={() => setActiveMood(mood.key)}>
                    <Text style={styles.smallButtonText}>{mood.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Recommandations</Text>
              {recommendations.map((item) => (
                <View key={`rec-${item.id}`} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.metaText}>{item.type} - {item.year}</Text>
                  <Text style={styles.metaText}>{item.synopsis ?? "Synopsis non disponible"}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Catalogue</Text>
              {catalog.map((item) => {
                const isFav = watchlist.includes(item.id);
                const itemProgress = progress[item.id] ?? 0;
                return (
                  <View key={item.id} style={styles.itemCard}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.metaText}>{item.type} - {item.year} - {item.status}</Text>
                    <Text style={styles.metaText}>Progression: {itemProgress}%</Text>
                    <View style={styles.buttonRow}>
                      <Pressable style={styles.smallButton} onPress={() => toggleWatchlist(item.id)}>
                        <Text style={styles.smallButtonText}>{isFav ? "Retirer" : "Favori"}</Text>
                      </Pressable>
                      <Pressable style={styles.smallButton} onPress={() => updateProgress(item.id, -10)}>
                        <Text style={styles.smallButtonText}>-10%</Text>
                      </Pressable>
                      <Pressable style={styles.smallButton} onPress={() => updateProgress(item.id, 10)}>
                        <Text style={styles.smallButtonText}>+10%</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {activeTab === "account" && (
          <>
            {!user && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{mode === "login" ? "Connexion" : "Inscription"}</Text>
                {mode === "register" && (
                  <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nom" placeholderTextColor="#8A8A8A" />
                )}
                <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#8A8A8A" autoCapitalize="none" keyboardType="email-address" />
                <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Mot de passe" placeholderTextColor="#8A8A8A" secureTextEntry />
                <Pressable style={styles.primaryButton} onPress={submitAuth} disabled={loading}>
                  <Text style={styles.primaryButtonText}>{loading ? "Chargement..." : mode === "login" ? "Se connecter" : "S'inscrire"}</Text>
                </Pressable>
                <Pressable onPress={() => setMode((v) => (v === "login" ? "register" : "login"))}>
                  <Text style={styles.switchText}>{mode === "login" ? "Pas de compte ? Creer" : "Deja inscrit ? Se connecter"}</Text>
                </Pressable>
              </View>
            )}

            {user && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Session</Text>
                <Text style={styles.metaText}>{user.name} ({user.email}) - role: {user.role}</Text>
                <Text style={styles.metaText}>Abonnement: {subscriptionLabel}</Text>

                <View style={styles.buttonRow}>
                  <Pressable style={styles.smallButton} onPress={() => checkout("monthly")}><Text style={styles.smallButtonText}>Payer mensuel</Text></Pressable>
                  <Pressable style={styles.smallButton} onPress={() => checkout("yearly")}><Text style={styles.smallButtonText}>Payer annuel</Text></Pressable>
                  {subscription?.status === "active" && (
                    <Pressable style={styles.smallButton} onPress={cancelSubscription}><Text style={styles.smallButtonText}>Annuler</Text></Pressable>
                  )}
                </View>

                <View style={styles.buttonRow}>
                  <Pressable style={styles.smallButton} onPress={() => setBillingStatusFilter("all")}><Text style={styles.smallButtonText}>Tous</Text></Pressable>
                  <Pressable style={styles.smallButton} onPress={() => setBillingStatusFilter("paid")}><Text style={styles.smallButtonText}>Payes</Text></Pressable>
                  <Pressable style={styles.smallButton} onPress={() => setBillingStatusFilter("failed")}><Text style={styles.smallButtonText}>Echecs</Text></Pressable>
                  <Pressable style={styles.smallButton} onPress={() => setBillingPlanFilter("all")}><Text style={styles.smallButtonText}>Plans</Text></Pressable>
                  <Pressable style={styles.smallButton} onPress={() => setBillingPlanFilter("monthly")}><Text style={styles.smallButtonText}>Mensuel</Text></Pressable>
                  <Pressable style={styles.smallButton} onPress={() => setBillingPlanFilter("yearly")}><Text style={styles.smallButtonText}>Annuel</Text></Pressable>
                </View>

                {billingHistory.slice(0, 5).map((txn) => (
                  <Text key={txn.id} style={styles.metaText}>{txn.receiptCode} - {txn.plan} - {(txn.amountCents / 100).toFixed(2)} {txn.currency} - {txn.status}</Text>
                ))}
              </View>
            )}
          </>
        )}

        {activeTab === "collab" && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Message collaborateur</Text>
              <TextInput style={styles.input} value={collabMessage.name} onChangeText={(v) => setCollabMessage((s) => ({ ...s, name: v }))} placeholder="Nom" placeholderTextColor="#8A8A8A" />
              <TextInput style={styles.input} value={collabMessage.email} onChangeText={(v) => setCollabMessage((s) => ({ ...s, email: v }))} placeholder="Email" placeholderTextColor="#8A8A8A" />
              <TextInput style={styles.input} value={collabMessage.organization} onChangeText={(v) => setCollabMessage((s) => ({ ...s, organization: v }))} placeholder="Organisation" placeholderTextColor="#8A8A8A" />
              <TextInput style={styles.input} value={collabMessage.interestArea} onChangeText={(v) => setCollabMessage((s) => ({ ...s, interestArea: v }))} placeholder="Interet" placeholderTextColor="#8A8A8A" />
              <TextInput style={[styles.input, styles.textarea]} value={collabMessage.message} onChangeText={(v) => setCollabMessage((s) => ({ ...s, message: v }))} placeholder="Message" placeholderTextColor="#8A8A8A" multiline />
              <Pressable style={styles.primaryButton} onPress={submitCollaboratorMessage}><Text style={styles.primaryButtonText}>Envoyer</Text></Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Avis produit</Text>
              <TextInput style={styles.input} value={feedbackForm.name} onChangeText={(v) => setFeedbackForm((s) => ({ ...s, name: v }))} placeholder="Nom" placeholderTextColor="#8A8A8A" />
              <TextInput style={styles.input} value={feedbackForm.email} onChangeText={(v) => setFeedbackForm((s) => ({ ...s, email: v }))} placeholder="Email" placeholderTextColor="#8A8A8A" />
              <TextInput style={styles.input} value={feedbackForm.rating} onChangeText={(v) => setFeedbackForm((s) => ({ ...s, rating: v }))} placeholder="Note 1-5" placeholderTextColor="#8A8A8A" keyboardType="number-pad" />
              <TextInput style={[styles.input, styles.textarea]} value={feedbackForm.comment} onChangeText={(v) => setFeedbackForm((s) => ({ ...s, comment: v }))} placeholder="Votre avis" placeholderTextColor="#8A8A8A" multiline />
              <Pressable style={styles.primaryButton} onPress={submitFeedback}><Text style={styles.primaryButtonText}>Envoyer avis</Text></Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Soumettre un projet</Text>
              <TextInput style={styles.input} value={submissionForm.creatorName} onChangeText={(v) => setSubmissionForm((s) => ({ ...s, creatorName: v }))} placeholder="Nom createur" placeholderTextColor="#8A8A8A" />
              <TextInput style={styles.input} value={submissionForm.creatorEmail} onChangeText={(v) => setSubmissionForm((s) => ({ ...s, creatorEmail: v }))} placeholder="Email createur" placeholderTextColor="#8A8A8A" />
              <TextInput style={styles.input} value={submissionForm.title} onChangeText={(v) => setSubmissionForm((s) => ({ ...s, title: v }))} placeholder="Titre" placeholderTextColor="#8A8A8A" />
              <TextInput style={styles.input} value={submissionForm.type} onChangeText={(v) => setSubmissionForm((s) => ({ ...s, type: v }))} placeholder="Type" placeholderTextColor="#8A8A8A" />
              <TextInput style={[styles.input, styles.textarea]} value={submissionForm.synopsis} onChangeText={(v) => setSubmissionForm((s) => ({ ...s, synopsis: v }))} placeholder="Synopsis" placeholderTextColor="#8A8A8A" multiline />
              <TextInput style={[styles.input, styles.textarea]} value={submissionForm.pitch} onChangeText={(v) => setSubmissionForm((s) => ({ ...s, pitch: v }))} placeholder="Pitch" placeholderTextColor="#8A8A8A" multiline />
              <Pressable style={styles.primaryButton} onPress={submitSubmission}><Text style={styles.primaryButtonText}>Soumettre</Text></Pressable>
            </View>

            {collabStatus && <Text style={styles.switchText}>{collabStatus}</Text>}
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0A0A0A"
  },
  container: {
    padding: 20,
    gap: 12
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    color: "#F0EDE8",
    fontSize: 26,
    fontWeight: "700"
  },
  subtitle: {
    color: "#C9A86C",
    marginTop: 4
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  tab: {
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A"
  },
  tabActive: {
    backgroundColor: "#C9A86C",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#C9A86C"
  },
  tabText: {
    color: "#F0EDE8",
    fontWeight: "700"
  },
  card: {
    backgroundColor: "#171717",
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#2A2A2A"
  },
  sectionTitle: {
    color: "#F0EDE8",
    fontSize: 18,
    fontWeight: "700"
  },
  input: {
    backgroundColor: "#101010",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 10,
    color: "#F0EDE8",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  textarea: {
    minHeight: 90,
    textAlignVertical: "top"
  },
  primaryButton: {
    backgroundColor: "#C9A86C",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#1A1A1A",
    fontWeight: "700"
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: "#3A3A3A",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  ghostButtonText: {
    color: "#F0EDE8"
  },
  switchText: {
    color: "#C9A86C",
    textAlign: "center"
  },
  error: {
    color: "#FF8C8C"
  },
  itemCard: {
    backgroundColor: "#111111",
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "#242424"
  },
  itemTitle: {
    color: "#F0EDE8",
    fontSize: 16,
    fontWeight: "700"
  },
  metaText: {
    color: "#B8B1A8"
  },
  buttonRow: {
    marginTop: 6,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  smallButton: {
    backgroundColor: "#252525",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  smallButtonActive: {
    backgroundColor: "#7f6534",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  smallButtonText: {
    color: "#F0EDE8",
    fontWeight: "600"
  }
});
