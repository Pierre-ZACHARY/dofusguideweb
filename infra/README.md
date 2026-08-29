# Infrastructure Cloudflare

Cette stack Pulumi crée la base D1 des comptes en juridiction UE, déploie le
Worker et ses assets avec Wrangler, puis associe les custom domains racine et
`www`. Le Worker redirige `www` vers le domaine racine.

Le déploiement Wrangler est exécuté comme une ressource Pulumi, car la sortie
du plugin Vite Cloudflare contient plusieurs modules générés que Wrangler doit
téléverser ensemble. Son hash de sources est conservé dans l'état Pulumi.

## Configuration initiale

```sh
cd infra
npm ci
pulumi login https://api.pulumi.com
pulumi stack init dev
pulumi config set cloudflareAccountId aaf857a57ff01f7b5c961b37053782e1
pulumi config set domainName dofusguideweb.com
pulumi config set googleClientId 559765229314-g71qdbv43se29qv3hnpfr9vnsd648ra5.apps.googleusercontent.com
pulumi config set --secret cloudflare:apiToken <token>
pulumi config set --secret metamobCredentialsKey <cle-aes-256-en-base64>
pulumi preview
pulumi up
```

Le backend Pulumi Cloud est aussi déclaré dans `Pulumi.yaml`. Sur une machine
où `PULUMI_BACKEND_URL` est défini globalement pour un autre projet, cette
variable reste prioritaire. Utilise alors `npm run preview` et `npm run up` :
ces scripts forcent uniquement ce projet à utiliser `https://api.pulumi.com`,
sans modifier la configuration globale de la machine.

`Pulumi.<stack>.yaml` est volontairement ignoré par Git. Le programme possède
des valeurs publiques par défaut pour le compte, le domaine et le client Google,
et accepte aussi `CLOUDFLARE_ACCOUNT_ID`, `DOMAIN_NAME` et `GOOGLE_CLIENT_ID`.
Le token Cloudflare peut venir de la configuration Pulumi locale ou de la
variable d'environnement `CLOUDFLARE_API_TOKEN`.

## Déploiement continu

Le workflow `.github/workflows/cloudflare.yml` valide puis déploie la stack à
chaque push sur `main`. Il peut également être lancé manuellement. Configure
ces secrets GitHub Actions dans l'environnement `production` ou au niveau du
dépôt :

- `PULUMI_ACCESS_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `METAMOB_CREDENTIALS_KEY`

Génère `METAMOB_CREDENTIALS_KEY` une seule fois, puis utilise exactement la
même valeur dans la stack locale et dans GitHub Actions :

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

En développement Cloudflare local, copie `.dev.vars.example` vers `.dev.vars`
et renseigne cette valeur. Le fichier `.dev.vars` est ignoré par Git. La stack
Pulumi locale lit également ce fichier si `metamobCredentialsKey` n'est pas
encore présent dans `Pulumi.dev.yaml`. En CI, le secret GitHub Actions reste la
source utilisée pour réinjecter la même clé dans le Worker à chaque déploiement.

La stack utilisée par défaut est
`Pierre-ZACHARY/dofusguideweb-cloudflare/dev`. Une variable GitHub Actions
`PULUMI_STACK_NAME` permet de la remplacer si nécessaire.

Le client Web Google One Tap n'est pas une ressource
`gcp.applicationintegration.Client` : cette ressource Pulumi configure Google
Application Integration, pas un client OAuth Web. Le client OAuth existant est
donc conservé et son identifiant public est injecté dans le Worker. Dans Google
Auth Platform, ajoute manuellement `https://dofusguideweb.com` et
`https://www.dofusguideweb.com` aux origines JavaScript autorisées. Aucun URI de
redirection n'est requis par le flux callback One Tap utilisé par l'application.
