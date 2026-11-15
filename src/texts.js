// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface (fr "favori", "étiquette", de "Lesezeichen", "Tag", es
// "marcador", "etiqueta"; linkding itself is in English only). German says
// "du", Spanish "usted" (test/i18n.test.js).
// -----------------------------------------------------------------------------

// Feature names (frozen by Gladys at creation).
export const NAMES = {
  en: {
    online: 'Server online',
    bookmarks: 'Bookmarks',
    unread: 'Unread bookmarks',
    archived: 'Archived bookmarks',
    latest: 'Latest bookmark',
    version: 'linkding version',
  },
  fr: {
    online: 'Serveur joignable',
    bookmarks: 'Favoris',
    unread: 'Favoris non lus',
    archived: 'Favoris archivés',
    latest: 'Dernier favori',
    version: 'Version de linkding',
  },
  de: {
    online: 'Server erreichbar',
    bookmarks: 'Lesezeichen',
    unread: 'Ungelesene Lesezeichen',
    archived: 'Archivierte Lesezeichen',
    latest: 'Neuestes Lesezeichen',
    version: 'linkding-Version',
  },
  es: {
    online: 'Servidor accesible',
    bookmarks: 'Marcadores',
    unread: 'Marcadores no leídos',
    archived: 'Marcadores archivados',
    latest: 'Último marcador',
    version: 'Versión de linkding',
  },
};

/** The "Latest bookmark" text when there is none. */
export const NONE = { en: 'None', fr: 'Aucun', de: 'Keines', es: 'Ninguno' };

export const STATUS_TEXT = {
  en: {
    none: 'Enter the address of linkding and an API token in the configuration.',
    invalid: 'The linkding address is not valid: enter an address like 192.168.1.50:9090.',
    token: 'Enter an API token (linkding → Settings → Integrations).',
    unauthorized: 'linkding refused the API token: create a new one in Settings → Integrations.',
    unreachable: 'linkding does not answer: check its address and that it is running.',
    error: 'linkding answered with an error: see the logs of the integration.',
    invalid_answer: 'This address does not answer like linkding: check the address and the port.',
  },
  fr: {
    none: "Saisissez l'adresse de linkding et un jeton d'API dans la configuration.",
    invalid:
      "L'adresse de linkding n'est pas valide : saisissez une adresse comme 192.168.1.50:9090.",
    token: "Saisissez un jeton d'API (linkding → Settings → Integrations).",
    unauthorized:
      "linkding a refusé le jeton d'API : créez-en un nouveau dans Settings → Integrations.",
    unreachable: "linkding ne répond pas : vérifiez son adresse et qu'il est démarré.",
    error: "linkding a répondu par une erreur : consultez les journaux de l'intégration.",
    invalid_answer: "Cette adresse ne répond pas comme linkding : vérifiez l'adresse et le port.",
  },
  de: {
    none: 'Gib in der Konfiguration die Adresse von linkding und ein API-Token ein.',
    invalid: 'Die linkding-Adresse ist ungültig: Gib eine Adresse wie 192.168.1.50:9090 ein.',
    token: 'Gib ein API-Token ein (linkding → Settings → Integrations).',
    unauthorized:
      'linkding hat das API-Token abgelehnt: Erstelle ein neues unter Settings → Integrations.',
    unreachable: 'linkding antwortet nicht: Prüfe die Adresse und ob es läuft.',
    error: 'linkding hat mit einem Fehler geantwortet: Sieh dir die Logs der Integration an.',
    invalid_answer: 'Diese Adresse antwortet nicht wie linkding: Prüfe Adresse und Port.',
  },
  es: {
    none: 'Introduzca la dirección de linkding y un token de API en la configuración.',
    invalid:
      'La dirección de linkding no es válida: introduzca una dirección como 192.168.1.50:9090.',
    token: 'Introduzca un token de API (linkding → Settings → Integrations).',
    unauthorized: 'linkding rechazó el token de API: cree uno nuevo en Settings → Integrations.',
    unreachable: 'linkding no responde: compruebe su dirección y que esté en marcha.',
    error: 'linkding respondió con un error: consulte los registros de la integración.',
    invalid_answer: 'Esta dirección no responde como linkding: compruebe la dirección y el puerto.',
  },
};

/** "Test the connection" once linkding answered. */
export const TEST_TEXT = {
  en: (version, bookmarks, unread) =>
    `Connected to linkding${version ? ` ${version}` : ''}: ${bookmarks} bookmark(s), ${unread} unread.`,
  fr: (version, bookmarks, unread) =>
    `Connecté à linkding${version ? ` ${version}` : ''} : ${bookmarks} favori(s), ${unread} non lu(s).`,
  de: (version, bookmarks, unread) =>
    `Mit linkding${version ? ` ${version}` : ''} verbunden: ${bookmarks} Lesezeichen, ${unread} ungelesen.`,
  es: (version, bookmarks, unread) =>
    `Conectado a linkding${version ? ` ${version}` : ''}: ${bookmarks} marcador(es), ${unread} sin leer.`,
};

export const INIT_FAILED = {
  en: 'The integration could not start: see its logs.',
  fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
  de: 'Die Integration konnte nicht starten: Sieh dir ihre Logs an.',
  es: 'La integración no pudo iniciarse: consulte sus registros.',
};

// Errors of the scene actions. `{detail}` is the reason linkding gave.
export const COMMAND_ERRORS = {
  en: {
    disabled:
      'Adding bookmarks from scenes is off: turn it on in the configuration of the integration.',
    timeout: 'linkding answered too late: the bookmark may have been saved anyway.',
    http: 'linkding could not save the bookmark: {detail}',
    read: 'linkding could not be read: {detail}',
    url: 'Enter a link starting with http:// or https://.',
    unreachable: 'linkding does not answer: nothing was done.',
    unauthorized: 'linkding refused the API token: nothing was done.',
    rejected: 'linkding refused the bookmark: {detail}',
  },
  fr: {
    disabled:
      "L'ajout de favoris par les scènes est désactivé : activez-le dans la configuration de l'intégration.",
    timeout: 'linkding a répondu trop tard : le favori a peut-être été enregistré quand même.',
    http: "linkding n'a pas pu enregistrer le favori : {detail}",
    read: "linkding n'a pas pu être lu : {detail}",
    url: 'Saisissez un lien commençant par http:// ou https://.',
    unreachable: "linkding ne répond pas : rien n'a été fait.",
    unauthorized: "linkding a refusé le jeton d'API : rien n'a été fait.",
    rejected: 'linkding a refusé le favori : {detail}',
  },
  de: {
    disabled:
      'Das Hinzufügen von Lesezeichen durch Szenen ist aus: Schalte es in der Konfiguration der Integration ein.',
    timeout:
      'linkding hat zu spät geantwortet: Das Lesezeichen wurde vielleicht trotzdem gespeichert.',
    http: 'linkding konnte das Lesezeichen nicht speichern: {detail}',
    read: 'linkding konnte nicht gelesen werden: {detail}',
    url: 'Gib einen Link ein, der mit http:// oder https:// beginnt.',
    unreachable: 'linkding antwortet nicht: Es wurde nichts getan.',
    unauthorized: 'linkding hat das API-Token abgelehnt: Es wurde nichts getan.',
    rejected: 'linkding hat das Lesezeichen abgelehnt: {detail}',
  },
  es: {
    disabled:
      'Añadir marcadores desde escenas está desactivado: actívelo en la configuración de la integración.',
    timeout:
      'linkding respondió demasiado tarde: puede que el marcador se haya guardado de todos modos.',
    http: 'linkding no pudo guardar el marcador: {detail}',
    read: 'No se pudo leer linkding: {detail}',
    url: 'Introduzca un enlace que empiece por http:// o https://.',
    unreachable: 'linkding no responde: no se ha hecho nada.',
    unauthorized: 'linkding rechazó el token de API: no se ha hecho nada.',
    rejected: 'linkding rechazó el marcador: {detail}',
  },
};

/** A coded message in every language, details filled in. */
export function commandMessage(code, values = {}) {
  return Object.fromEntries(
    Object.entries(COMMAND_ERRORS).map(([language, table]) => [
      language,
      (table[code] ?? table.unreachable).replace('{detail}', values.detail ?? '').slice(0, 200),
    ]),
  );
}

export const pick = (table, language) => table[language] ?? table.en;
