# UniCreate — Documentation technique

## Vue d'ensemble

UniCreate est une application desktop (Tauri 2 + React) pour créer et soumettre des manifestes WinGet sur `microsoft/winget-pkgs`. Elle remplace l'utilisation de `wingetcreate` CLI ou `YAMLCreate.ps1` par une interface graphique avec auto-complétion.

**Repo** : https://github.com/drrakendu78/UniCreate
**Version** : 1.0.0
**Identifiant** : `com.drrakendu78.unicreate`

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Rust (Tauri 2) |
| State | Zustand + persist middleware |
| Styles | Tailwind CSS + Radix UI |
| Icônes | Lucide React |
| HTTP (Rust) | reqwest 0.13 |
| Hash | sha2 (SHA256) |
| MSIX | zip 2 (extraction signature) |
| Keychain | keyring 3 (stockage token OS) |
| GitHub API | REST v3 (via reqwest) |

## Structure du projet

```
UniCreate/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── lib.rs              # Commandes Tauri (point d'entrée, 12 commandes)
│       ├── hash.rs             # Téléchargement + SHA256 + détection type/arch + MSIX signature
│       ├── github.rs           # API GitHub (metadata, manifestes existants, check exists, soumission PR)
│       └── yaml_generator.rs   # Génération YAML (version, installer, locale, locales additionnelles)
├── src/
│   ├── main.tsx
│   ├── App.tsx                 # Router + Toast container + raccourci Ctrl+Enter
│   ├── index.css               # Thème light/dark + animations
│   ├── pages/
│   │   ├── Home.tsx            # Accueil : nouveau/update + import URL winget-pkgs + historique
│   │   ├── StepInstaller.tsx   # Étape 1 : URL + drag & drop + auto-détection arch + MSIX signature
│   │   ├── StepMetadata.tsx    # Étape 2 : métadonnées + validation ID + multi-locale
│   │   ├── StepReview.tsx      # Étape 3 : preview YAML (inclut locales additionnelles)
│   │   └── StepSubmit.tsx      # Étape 4 : auth GitHub + keychain + historique soumissions
│   ├── components/
│   │   └── StepperHeader.tsx   # Barre de progression des étapes
│   ├── stores/
│   │   ├── manifest-store.ts   # Store principal (persisté dans localStorage)
│   │   ├── toast-store.ts      # Notifications toast (succès/erreur/info, auto-dismiss 4s)
│   │   └── history-store.ts    # Historique des soumissions (persisté dans localStorage)
│   └── lib/
│       ├── types.ts            # Types TypeScript
│       ├── utils.ts            # Utilitaires (cn)
│       └── repo-mappings.ts    # Mappings perso repo→package (via .env.local / VITE_REPO_MAPPINGS)
├── .env.example                # Template pour les mappings perso
├── .env.local                  # Mappings perso (gitignored)
└── index.html                  # Détection thème système (dark/light)
```

## Commandes Tauri

| Commande | Module | Description |
|----------|--------|-------------|
| `download_and_hash(url)` | hash.rs | Télécharge, SHA256, détecte type + arch + signature MSIX |
| `hash_local_file(path)` | hash.rs | Hash un fichier local (drag & drop), détecte type/arch/signature |
| `generate_yaml(manifest)` | yaml_generator.rs | Génère les fichiers YAML winget 1.9.0 (+ locales additionnelles) |
| `save_yaml_files(files, package_id, version)` | lib.rs | Sauvegarde les YAML sur le Bureau |
| `fetch_repo_metadata(url)` | github.rs | Récupère les métadonnées d'un repo GitHub |
| `fetch_existing_manifest(package_id)` | github.rs | Récupère un manifeste existant depuis winget-pkgs |
| `check_package_exists(package_id)` | github.rs | Vérifie si un PackageIdentifier existe dans winget-pkgs |
| `authenticate_github(token)` | github.rs | Vérifie un token PAT GitHub |
| `submit_manifest(token, yaml_files, package_id, version)` | github.rs | Fork + branche + commit + PR sur winget-pkgs |
| `store_github_token(token)` | lib.rs | Stocke le token dans le keychain OS (Windows Credential Manager) |
| `get_github_token()` | lib.rs | Récupère le token depuis le keychain OS |
| `clear_github_token()` | lib.rs | Supprime le token du keychain OS |

## Wizard (étapes)

```
Home → Installer → Metadata → Review → Submit
       (étape 1)   (étape 2)  (étape 3) (étape 4)
```

### Home
- **Nouveau package** : démarre le wizard vide
- **Mise à jour** : recherche par PackageIdentifier ou URL winget-pkgs, pré-remplit les métadonnées
- **Import URL** : coller `https://github.com/microsoft/winget-pkgs/tree/.../manifests/...` → auto-extrait le PackageIdentifier
- **Historique** : liste des 5 dernières PR soumises avec liens directs

### Étape 1 — Installer
- Input URL + bouton "Analyze"
- **Drag & drop** : glisser un fichier local pour calculer le hash (URL à fournir séparément)
- Télécharge le fichier, calcule SHA256 automatiquement
- **Détection auto type** : msi, exe, msix, zip depuis le nom de fichier
- **Détection auto architecture** : x64, x86, arm64, arm depuis le nom de fichier (patterns: _x64, amd64, win64, etc.)
- **MSIX SignatureSha256** : extraction automatique depuis AppxSignature.p7x dans le package MSIX
- Si URL GitHub : fetch les métadonnées du repo en parallèle
- Support multi-installer (plusieurs architectures)
- Badge "SIGNED" affiché pour les MSIX avec signature détectée

### Étape 2 — Metadata
- **Requis** : PackageIdentifier, Version, Locale, Publisher, PackageName, License, ShortDescription
- **Validation PackageIdentifier en temps réel** :
  - Format regex : `Publisher.Package` (lettres/chiffres)
  - Check existence dans winget-pkgs (debounce 800ms)
  - Indicateurs visuels : spinner (checking), checkmark vert (existe), badge "NEW" (nouveau), icône erreur (format invalide)
- **Optionnels** (section dépliable) : Description, URLs, Author, Moniker, Tags, ReleaseNotes
- **Multi-locale** (section dépliable) :
  - Ajouter des locales supplémentaires (fr-FR, de-DE, etc.)
  - Chaque locale a ses propres champs traduits (PackageName, ShortDescription, Description)
  - Publisher et License pré-remplis depuis la locale par défaut
  - Génère des fichiers YAML additionnels avec `ManifestType: "locale"` (vs `"defaultLocale"`)

### Étape 3 — Review
- Génère et affiche les fichiers YAML en onglets (3 + locales additionnelles)
- Boutons : copier dans le presse-papier, sauvegarder sur le Bureau

### Étape 4 — Submit
- Input token GitHub PAT (scope `public_repo` requis)
- **Stockage token optionnel** : checkbox "Remember" → stocke dans le keychain OS (Windows Credential Manager)
- Token chargé automatiquement au montage si déjà stocké
- Authentification → Fork winget-pkgs → Créer branche → Commit fichiers → Ouvrir PR
- Soumission ajoutée à l'historique automatiquement
- Toast de succès/erreur

## Format YAML winget 1.9.0

Fichiers générés dans `manifests/<lettre>/<Publisher>/<Package>/<Version>/` :

1. **`Publisher.Package.yaml`** — Version file (`ManifestType: "version"`)
2. **`Publisher.Package.installer.yaml`** — Installer file (`ManifestType: "installer"`)
3. **`Publisher.Package.locale.en-US.yaml`** — Default locale (`ManifestType: "defaultLocale"`)
4. **`Publisher.Package.locale.fr-FR.yaml`** — Locale additionnelle (`ManifestType: "locale"`) — si ajoutée

## Sérialisation Rust ↔ TypeScript

Toutes les structs Rust utilisent `#[serde(rename_all = "camelCase")]` pour matcher les noms JavaScript.
Exception : `GitHubUser` utilise `#[serde(alias = "...")]` car il désérialise du snake_case (API GitHub) et sérialise en camelCase (frontend).

## Thème

- Détection automatique du thème système via `prefers-color-scheme: dark`
- Écoute en temps réel les changements de thème Windows
- CSS variables Tailwind pour light et dark mode

## Persistance

- **localStorage** (`unicreate-manifest`) : étape en cours, manifest, mode update — via Zustand persist
- **localStorage** (`unicreate-history`) : historique des soumissions (packageId, version, prUrl, date, user)
- **Keychain OS** : token GitHub PAT (optionnel, opt-in via checkbox "Remember")
- **Pas sauvegardé** : états temporaires (isAnalyzing, isSubmitting), YAML généré, toasts
- **Reset** : efface manifest + localStorage manifest (historique et token conservés)

## Toast Notifications

- Système de notifications non-bloquantes en bas à droite
- 3 types : `success` (vert), `error` (rouge), `info` (bleu)
- Auto-dismiss après 4 secondes
- Bouton de fermeture manuelle
- Store Zustand séparé (`toast-store.ts`)

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl+Enter` | Cliquer le bouton principal de l'étape en cours (Analyze, Continue, Submit) |
| `Enter` | Valider le champ URL (étape 1), lancer la recherche (mode update) |

Le raccourci Ctrl+Enter utilise `data-action="primary"` sur les boutons pour les identifier.

## Drag & Drop

- Écoute l'événement `onDragDropEvent` de la fenêtre Tauri
- Zone de drop visuelle avec animation (bordure bleue pointillée + icône Upload)
- Quand un fichier est déposé :
  1. Hash calculé localement via `hash_local_file`
  2. Type et architecture auto-détectés
  3. L'utilisateur doit fournir l'URL de téléchargement
  4. Cliquer "Add with local hash" pour ajouter l'installer

## Mappings perso (repo-mappings)

Permet de mapper un repo GitHub à un PackageIdentifier/PackageName personnalisé.
Configuré dans `.env.local` (gitignored) via la variable `VITE_REPO_MAPPINGS`.

Format : `owner/repo:PackageIdentifier:Package Name` (virgule pour séparer plusieurs mappings)

## Sécurité

- Aucune donnée stockée côté serveur (100% local)
- Token GitHub : en mémoire par défaut, optionnellement dans le keychain OS
- CSP Tauri : `default-src 'self'; connect-src 'self' https://api.github.com https://*`
- Pas de base de données, pas de telemetry
- Keychain utilise Windows Credential Manager (chiffré par l'OS)