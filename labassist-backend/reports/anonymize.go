package reports

import "labassist/models"

// anonymousReporter is what a student sees in place of the reporter's name.
const anonymousReporter = "ผู้รายงาน (ไม่เปิดเผยตัวตน)"

// hidesReporter reports whether the actor must not learn who filed r: the
// student the report is about never sees the reporter's identity. Reviewers
// and the reporter themselves still do.
func hidesReporter(r models.LabBoyReport, actor Actor) bool {
	return actor.Role == string(models.RoleStudent) && r.ReporterID != actor.ID
}

// anonymizeReport strips the reporter's identity from the report itself.
func anonymizeReport(r *models.LabBoyReport) {
	r.ReporterID = 0
	r.ReporterName = anonymousReporter
}

// anonymizeDetail strips the reporter's identity from everything in a
// report's detail view: the report, the evidence they uploaded, the extra
// information they added, and the timeline steps they took.
func anonymizeDetail(d *ReportDetail) {
	reporterID := d.Report.ReporterID
	anonymizeReport(&d.Report)
	for i := range d.Evidence {
		if d.Evidence[i].UploadedByID == reporterID {
			d.Evidence[i].UploadedByID = 0
			d.Evidence[i].UploadedByName = anonymousReporter
		}
	}
	for i := range d.Responses {
		if d.Responses[i].AuthorID == reporterID {
			d.Responses[i].AuthorID = 0
			d.Responses[i].AuthorName = anonymousReporter
			d.Responses[i].AuthorRole = ""
		}
	}
	for i := range d.History {
		if d.History[i].ActorID == reporterID {
			d.History[i].ActorID = 0
			d.History[i].ActorName = anonymousReporter
		}
	}
}
