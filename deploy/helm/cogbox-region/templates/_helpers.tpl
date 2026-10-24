{{/*
Common naming and labels for cogbox-region. Release name SHOULD be the region:
helm upgrade --install region-shared-us ./cogbox-region ...
*/}}
{{- define "cogbox-region.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "cogbox-region.labels" -}}
app.kubernetes.io/name: cogbox-region
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
cogbox.io/region: {{ .Values.regionName | quote }}
{{- end -}}

{{- define "cogbox-region.image" -}}
{{- $repo := printf "%s/%s" .Values.imageRegistry .repository -}}
{{- if .Values.imageDigest -}}
{{- printf "%s:%s@%s" $repo .Values.imageTag .Values.imageDigest -}}
{{- else -}}
{{- printf "%s:%s" $repo .Values.imageTag -}}
{{- end -}}
{{- end -}}

{{- define "cogbox-region.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-creds" (include "cogbox-region.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
Secret holding one runner API key per StatefulSet ordinal:
token-0, token-1, ... token-(maxReplicas-1). Each runner replica must have
its own control-plane Runner record; a shared token makes every pod report
as the same runner and overwrite its domain/metrics.
*/}}
{{- define "cogbox-region.runnerTokensSecretName" -}}
{{- $existing := dig "tokens" "existingSecret" "" .Values.runner -}}
{{- if $existing -}}
{{- $existing -}}
{{- else -}}
{{- printf "%s-runner-tokens" (include "cogbox-region.fullname" .) -}}
{{- end -}}
{{- end -}}
