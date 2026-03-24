/**
 * Point the site at your central Google Form and the Sheet that receives responses.
 *
 * Security: anyone who can fetch the CSV sees all rows. Keys only limit what this page shows.
 *
 * Responses sheet: https://docs.google.com/spreadsheets/d/1Iesaa8MYd0qWzZyiyH0bPOj-KTTAz7kCi1F6GkweBqA/edit?usp=sharing
 *
 * If loading fails: Share → Anyone with the link can view, OR Publish to web → CSV, and paste that URL
 * into responsesCsvUrl. Set responsesSheetGid to the #gid= value for the “Form Responses” tab if needed.
 */
window.SCRIPTOR_CONFIG = {
  googleFormEmbedUrl:
    "https://docs.google.com/forms/d/e/1FAIpQLSesZ2m5doEZ2kLh5TrNkKGwOZOuG74QbvROHrgvIRh2cvwcGg/viewform?embedded=true",

  /** Primary CSV URL (export link). */
  responsesCsvUrl:
    "https://docs.google.com/spreadsheets/d/1Iesaa8MYd0qWzZyiyH0bPOj-KTTAz7kCi1F6GkweBqA/export?format=csv&gid=0",

  /** Used to build a fallback fetch (gviz CSV) if the export URL fails in the browser. */
  spreadsheetId: "1Iesaa8MYd0qWzZyiyH0bPOj-KTTAz7kCi1F6GkweBqA",
  /** Tab id: open the Form Responses tab and copy the number after #gid= in the URL. */
  responsesSheetGid: "0",

  /**
   * Column indices (0-based). Headers: Timestamp, Week of…, Person…, Information/Quotes:, Photos/videos
   * media: one index or several — multiple columns are merged (extra Google file-upload columns).
   */
  csvColumns: {
    timestamp: 0,
    week: 1,
    userId: 2,
    text: 3,
    media: [4, 5, 6, 7]
  }
};
