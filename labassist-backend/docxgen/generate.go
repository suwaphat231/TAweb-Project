// Package docxgen renders real .docx files for staff-generated documents by
// token-substituting hand-prepared templates (see templates/*.docx) rather
// than building OOXML from scratch. Templates are derived from the
// department's actual paper forms, so the generated output keeps their exact
// letterhead and legal wording.
package docxgen

import (
	"archive/zip"
	"bytes"
	"embed"
	"fmt"
	"io"
	"regexp"
	"strings"
)

//go:embed templates/payment_evidence.docx templates/payment_request.docx templates/work_report.docx templates/lab_boy_hiring_notice.docx
var templateFS embed.FS

var trPattern = regexp.MustCompile(`(?s)<w:tr\b.*?</w:tr>`)

// RowGroup expands a single template <w:tr> (identified by Anchor, a token
// that appears exactly once inside it) into one row per entry in Rows, each
// with its own token substitutions.
type RowGroup struct {
	Anchor string
	Rows   []map[string]string
}

// RenderInput describes one document to render from one embedded template.
type RenderInput struct {
	TemplateFile string
	RowGroups    []RowGroup
	Scalars      map[string]string
}

// Render loads the named embedded template, expands any row groups, applies
// scalar token replacement document-wide, and returns the resulting .docx
// bytes. Every other zip entry is copied through unchanged.
func Render(in RenderInput) ([]byte, error) {
	raw, err := templateFS.ReadFile("templates/" + in.TemplateFile)
	if err != nil {
		return nil, fmt.Errorf("docxgen: template %s: %w", in.TemplateFile, err)
	}
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return nil, fmt.Errorf("docxgen: opening template %s: %w", in.TemplateFile, err)
	}

	entries := make(map[string][]byte, len(zr.File))
	var docXML string
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		b, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}
		if f.Name == "word/document.xml" {
			docXML = string(b)
		} else {
			entries[f.Name] = b
		}
	}
	if docXML == "" {
		return nil, fmt.Errorf("docxgen: word/document.xml missing in %s", in.TemplateFile)
	}

	for _, group := range in.RowGroups {
		var err error
		docXML, err = expandRows(docXML, group.Anchor, group.Rows)
		if err != nil {
			return nil, fmt.Errorf("docxgen: %s: %w", in.TemplateFile, err)
		}
	}
	for token, val := range in.Scalars {
		docXML = strings.ReplaceAll(docXML, token, escapeXML(val))
	}

	var out bytes.Buffer
	zw := zip.NewWriter(&out)
	for _, f := range zr.File { // preserve original entry order
		w, err := zw.Create(f.Name)
		if err != nil {
			return nil, err
		}
		if f.Name == "word/document.xml" {
			if _, err := w.Write([]byte(docXML)); err != nil {
				return nil, err
			}
		} else if _, err := w.Write(entries[f.Name]); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// RenderWithPreparedXML renders a document using a pre-prepared XML string
// instead of loading from the embedded template. The XML has already had
// tokens injected programmatically. All zip entries except word/document.xml
// are copied from the named template file.
func RenderWithPreparedXML(templateFile, preparedDocXML string, in RenderInput) ([]byte, error) {
	raw, err := templateFS.ReadFile("templates/" + templateFile)
	if err != nil {
		return nil, fmt.Errorf("docxgen: template %s: %w", templateFile, err)
	}
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return nil, fmt.Errorf("docxgen: opening template %s: %w", templateFile, err)
	}

	entries := make(map[string][]byte, len(zr.File))
	for _, f := range zr.File {
		if f.Name == "word/document.xml" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		b, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}
		entries[f.Name] = b
	}

	docXML := preparedDocXML
	for _, group := range in.RowGroups {
		var err error
		docXML, err = expandRows(docXML, group.Anchor, group.Rows)
		if err != nil {
			return nil, fmt.Errorf("docxgen: %s: %w", templateFile, err)
		}
	}
	for token, val := range in.Scalars {
		docXML = strings.ReplaceAll(docXML, token, escapeXML(val))
	}

	var out bytes.Buffer
	zw := zip.NewWriter(&out)
	for _, f := range zr.File {
		w, err := zw.Create(f.Name)
		if err != nil {
			return nil, err
		}
		if f.Name == "word/document.xml" {
			if _, err := w.Write([]byte(docXML)); err != nil {
				return nil, err
			}
		} else if _, err := w.Write(entries[f.Name]); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// expandRows finds the single <w:tr> containing anchor and replaces it with
// one clone per entry in rows, each with its own token substitutions applied.
func expandRows(docXML, anchor string, rows []map[string]string) (string, error) {
	rowStart, rowEnd := -1, -1
	for _, m := range trPattern.FindAllStringIndex(docXML, -1) {
		if strings.Contains(docXML[m[0]:m[1]], anchor) {
			rowStart, rowEnd = m[0], m[1]
			break
		}
	}
	if rowStart < 0 {
		return "", fmt.Errorf("row anchor %q not found", anchor)
	}
	tmpl := docXML[rowStart:rowEnd]
	var b strings.Builder
	for _, row := range rows {
		rowXML := tmpl
		for token, val := range row {
			rowXML = strings.ReplaceAll(rowXML, token, escapeXML(val))
		}
		b.WriteString(rowXML)
	}
	return docXML[:rowStart] + b.String() + docXML[rowEnd:], nil
}

func escapeXML(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(s)
}
