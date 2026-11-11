#!/usr/bin/env bash
# Mode maintenance du site laureyogaclub.fr
#   ./scripts/maintenance.sh on      -> affiche la page « Le site prend une pause » (branche `maintenance`)
#   ./scripts/maintenance.sh off     -> remet le vrai site (branche `main`)
#   ./scripts/maintenance.sh status  -> indique la branche publiée
# Le changement est visible en ligne au bout d'environ 1 minute.
set -euo pipefail
REPO="tziguili/site_laure"
GH="$(command -v gh || echo "$HOME/.local/bin/gh")"

publish() {
  "$GH" api -X PUT "repos/$REPO/pages" -f "source[branch]=$1" -f "source[path]=/" >/dev/null
  echo "GitHub Pages publie maintenant la branche « $1 ». En ligne d'ici ~1 minute : https://laureyogaclub.fr"
}

case "${1:-status}" in
  on)     publish maintenance ;;
  off)    publish main ;;
  status) echo "Branche publiée : $("$GH" api "repos/$REPO/pages" --jq .source.branch)" ;;
  *)      echo "Usage : $0 on|off|status" >&2; exit 1 ;;
esac
