import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
const TOKEN_KEY = "muse_mobile_token";
export default function App() {
    const apiUrl = useMemo(() => process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000", []);
    const [mode, setMode] = useState("login");
    const [name, setName] = useState("Muse Mobile");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [watchlist, setWatchlist] = useState([]);
    const [progress, setProgress] = useState({});
    const loadAppData = useCallback(async (jwtToken) => {
        const headers = { Authorization: `Bearer ${jwtToken}` };
        try {
            const [meRes, catalogRes, stateRes] = await Promise.all([
                fetch(`${apiUrl}/api/v1/auth/me`, { headers }),
                fetch(`${apiUrl}/api/v1/catalog`),
                fetch(`${apiUrl}/api/v1/me/state`, { headers })
            ]);
            if (!meRes.ok || !catalogRes.ok || !stateRes.ok) {
                throw new Error("Impossible de charger les donnees");
            }
            const me = (await meRes.json());
            const catalogData = (await catalogRes.json());
            const state = (await stateRes.json());
            setUser(me);
            setCatalog(catalogData.items ?? []);
            setWatchlist(state.watchlist ?? []);
            setProgress(state.progress ?? {});
            setError(null);
        }
        catch {
            setError("Session invalide ou API inaccessible.");
            await logout();
        }
    }, [apiUrl]);
    useEffect(() => {
        (async () => {
            const stored = await AsyncStorage.getItem(TOKEN_KEY);
            if (!stored) {
                try {
                    const catalogRes = await fetch(`${apiUrl}/api/v1/catalog`);
                    if (catalogRes.ok) {
                        const catalogData = (await catalogRes.json());
                        setCatalog(catalogData.items ?? []);
                    }
                }
                catch {
                    setCatalog([]);
                }
                return;
            }
            setToken(stored);
            await loadAppData(stored);
        })();
    }, [apiUrl, loadAppData]);
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
            const data = (await res.json());
            setToken(data.token);
            await AsyncStorage.setItem(TOKEN_KEY, data.token);
            await loadAppData(data.token);
            setPassword("");
        }
        catch (e) {
            const message = e instanceof Error ? e.message : "Erreur d'authentification";
            setError(message);
        }
        finally {
            setLoading(false);
        }
    }
    async function logout() {
        setToken(null);
        setUser(null);
        setWatchlist([]);
        setProgress({});
        await AsyncStorage.removeItem(TOKEN_KEY);
    }
    async function toggleWatchlist(contentId) {
        if (!token) {
            setError("Connecte-toi pour gerer les favoris.");
            return;
        }
        const already = watchlist.includes(contentId);
        const method = already ? "DELETE" : "POST";
        const url = already
            ? `${apiUrl}/api/v1/me/watchlist/${encodeURIComponent(contentId)}`
            : `${apiUrl}/api/v1/me/watchlist`;
        const init = {
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
        const data = (await res.json());
        setWatchlist(data.items ?? []);
    }
    async function updateProgress(contentId, delta) {
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
    return (_jsxs(SafeAreaView, { style: styles.safe, children: [_jsx(StatusBar, { style: "light" }), _jsxs(ScrollView, { contentContainerStyle: styles.container, children: [_jsxs(View, { style: styles.headerRow, children: [_jsxs(View, { children: [_jsx(Text, { style: styles.title, children: "Muse Origin Mobile" }), _jsx(Text, { style: styles.subtitle, children: "Streaming, favoris et progression synchronises" })] }), user && (_jsx(Pressable, { style: styles.ghostButton, onPress: logout, children: _jsx(Text, { style: styles.ghostButtonText, children: "Logout" }) }))] }), !user && (_jsxs(View, { style: styles.card, children: [_jsx(Text, { style: styles.sectionTitle, children: mode === "login" ? "Connexion" : "Inscription" }), mode === "register" && (_jsx(TextInput, { style: styles.input, value: name, onChangeText: setName, placeholder: "Nom", placeholderTextColor: "#8A8A8A" })), _jsx(TextInput, { style: styles.input, value: email, onChangeText: setEmail, placeholder: "Email", placeholderTextColor: "#8A8A8A", autoCapitalize: "none", keyboardType: "email-address" }), _jsx(TextInput, { style: styles.input, value: password, onChangeText: setPassword, placeholder: "Mot de passe", placeholderTextColor: "#8A8A8A", secureTextEntry: true }), _jsx(Pressable, { style: styles.primaryButton, onPress: submitAuth, disabled: loading, children: _jsx(Text, { style: styles.primaryButtonText, children: loading ? "Chargement..." : mode === "login" ? "Se connecter" : "S'inscrire" }) }), _jsx(Pressable, { onPress: () => setMode((v) => (v === "login" ? "register" : "login")), children: _jsx(Text, { style: styles.switchText, children: mode === "login" ? "Pas de compte ? Creer" : "Deja inscrit ? Se connecter" }) })] })), user && (_jsxs(View, { style: styles.card, children: [_jsx(Text, { style: styles.sectionTitle, children: "Session" }), _jsxs(Text, { style: styles.metaText, children: [user.name, " (", user.email, ") - role: ", user.role] })] })), error && _jsx(Text, { style: styles.error, children: error }), _jsxs(View, { style: styles.card, children: [_jsx(Text, { style: styles.sectionTitle, children: "Catalogue" }), catalog.map((item) => {
                                const isFav = watchlist.includes(item.id);
                                const itemProgress = progress[item.id] ?? 0;
                                return (_jsxs(View, { style: styles.itemCard, children: [_jsx(Text, { style: styles.itemTitle, children: item.title }), _jsxs(Text, { style: styles.metaText, children: [item.type, " - ", item.year] }), _jsxs(Text, { style: styles.metaText, children: ["Progression: ", itemProgress, "%"] }), _jsxs(View, { style: styles.buttonRow, children: [_jsx(Pressable, { style: styles.smallButton, onPress: () => toggleWatchlist(item.id), children: _jsx(Text, { style: styles.smallButtonText, children: isFav ? "Retirer" : "Favori" }) }), _jsx(Pressable, { style: styles.smallButton, onPress: () => updateProgress(item.id, -10), children: _jsx(Text, { style: styles.smallButtonText, children: "-10%" }) }), _jsx(Pressable, { style: styles.smallButton, onPress: () => updateProgress(item.id, 10), children: _jsx(Text, { style: styles.smallButtonText, children: "+10%" }) })] })] }, item.id));
                            })] })] })] }));
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
        gap: 8
    },
    smallButton: {
        backgroundColor: "#252525",
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 10
    },
    smallButtonText: {
        color: "#F0EDE8",
        fontWeight: "600"
    }
});
