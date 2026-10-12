{{/*
Common naming and labels for cogbox-control.
*/}}
{{- define "cogbox-control.fullname" -}}
{{- printf "%s-control" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "cogbox-control.labels" -}}
app.kubernetes.io/name: cogbox-control
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
{{- end -}}

{{- define "cogbox-control.image" -}}
{{- $repo := printf "%s/%s" .Values.imageRegistry .Values.api.repository -}}
{{- if .Values.imageDigest -}}
{{- printf "%s:%s@%s" $repo .Values.imageTag .Values.imageDigest -}}
{{- else -}}
{{- printf "%s:%s" $repo .Values.imageTag -}}
{{- end -}}
{{- end -}}

{{- define "cogbox-control.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "cogbox-control.fullname" .) -}}
{{- end -}}
{{- end -}}
