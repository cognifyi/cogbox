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
